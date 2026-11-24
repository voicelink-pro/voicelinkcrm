import {
  apiError,
  apiList,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  parseJsonBody,
  parsePagination,
  quoted,
  searchPattern,
} from "@/lib/api/auth"
import { createClientApiSchema, IMPLEMENTATION_STAGE_CODES } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const sp = url.searchParams
  const { limit, offset } = parsePagination(sp)

  const relationship = sp.get("relationship")?.trim() ?? "client"
  const serviceStatus = sp.get("service_status")?.trim() ?? ""
  const implementationStage = sp.get("implementation_stage")?.trim() ?? ""
  const archived = sp.get("archived") === "true"
  const pattern = searchPattern(sp.get("q"))

  try {
    const admin = createAdminClient()
    let query = admin
      .from("accounts")
      .select(
        "id, display_name, company_name, kind, relationship, service_status, nip, website, address, implementation_stage, implementation_due_on, implementation_notes, integration_systems, integration_docs_status, integration_notes, version, archived_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("workspace_id", auth.workspaceId)

    if (!archived) {
      query = query.is("archived_at", null)
    }
    if (relationship === "client" || relationship === "prospect") {
      query = query.eq("relationship", relationship)
    }
    if (serviceStatus === "active" || serviceStatus === "inactive") {
      query = query.eq("service_status", serviceStatus)
    }
    if (implementationStage) {
      if (!IMPLEMENTATION_STAGE_CODES.includes(implementationStage)) {
        return apiError(
          422,
          "invalid_filter",
          `Nieznany etap wdrożenia: ${implementationStage}.`,
          correlationId,
        )
      }
      query = query.eq("implementation_stage", implementationStage)
    }
    if (pattern) {
      const value = quoted(pattern)
      query = query.or(
        `display_name.ilike.${value},company_name.ilike.${value},nip.ilike.${value}`,
      )
    }

    const { data, error, count } = await query
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać listy klientów.", correlationId)
    }

    const accounts = data ?? []
    const accountIds = accounts.map((a) => a.id)

    const contactsRes = accountIds.length
      ? await admin
          .from("contacts")
          .select("id, account_id, full_name, email, phone_raw, phone_e164, is_primary")
          .eq("workspace_id", auth.workspaceId)
          .in("account_id", accountIds)
          .is("archived_at", null)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
      : { data: [] }

    const primaryContactMap = new Map<
      string,
      { id: string; full_name: string; email: string | null; phone: string | null }
    >()
    for (const c of contactsRes.data ?? []) {
      if (!primaryContactMap.has(c.account_id)) {
        primaryContactMap.set(c.account_id, {
          id: c.id,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone_e164 ?? c.phone_raw,
        })
      }
    }

    const items = accounts.map((a) => ({
      ...a,
      primary_contact: primaryContactMap.get(a.id) ?? null,
    }))

    return apiList(items, { total: count ?? 0, limit, offset }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function POST(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const parsed = await parseJsonBody(request, createClientApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data

  const created = await callAgentRpc<string>(
    "create_manual_client",
    {
      p_actor_user_id: auth.actorUserId,
      p_display_name: body.display_name,
      p_company_name: body.company_name ?? null,
      p_full_name: body.full_name ?? null,
      p_email: body.email ?? null,
      p_phone: body.phone ?? null,
      p_nip: body.nip ?? null,
      p_implementation_stage: body.implementation_stage ?? null,
      p_implementation_due_on: body.implementation_due_on ?? null,
      p_integration_systems: body.integration_systems ?? null,
    },
    correlationId,
  )

  if (!created.ok) return created.response

  const accountId = created.data
  const admin = createAdminClient()

  const [{ data: account }, { data: contacts }] = await Promise.all([
    admin
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, full_name, job_title, email, phone_raw, phone_e164, is_primary, version")
      .eq("account_id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .is("archived_at", null),
  ])

  return apiOk(
    {
      account: account ?? { id: accountId },
      contacts: contacts ?? [],
    },
    correlationId,
    201,
  )
}
