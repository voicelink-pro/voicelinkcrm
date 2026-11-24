import {
  apiError,
  apiList,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
  parsePagination,
  quoted,
  searchPattern,
} from "@/lib/api/auth"
import { createLeadApiSchema, DEAL_STAGE_CODES } from "@/lib/api/schemas"
import { notifyWorkspaceAboutLead } from "@/lib/crm/lead-push"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const ALLOWED_SORTS = new Set([
  "created_at",
  "title",
  "stage",
  "last_contact_at",
  "next_follow_up_on",
  "won_at",
  "lost_at",
])

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const sp = url.searchParams
  const { limit, offset } = parsePagination(sp)

  const stage = sp.get("stage")?.trim() ?? ""
  const productType = sp.get("product_type")?.trim() ?? ""
  const owner = sp.get("owner_user_id")?.trim() ?? sp.get("owner")?.trim() ?? ""
  const source = sp.get("source")?.trim() ?? ""
  const archived = sp.get("archived") === "true"
  const rawSort = sp.get("sort")?.trim() ?? "created_at"
  const sort = ALLOWED_SORTS.has(rawSort) ? rawSort : "created_at"
  const asc = sp.get("dir")?.toLowerCase() === "asc"
  const pattern = searchPattern(sp.get("q"))

  try {
    const admin = createAdminClient()
    let query = admin
      .from("lead_directory")
      .select("*", { count: "exact" })
      .eq("workspace_id", auth.workspaceId)

    if (!archived) {
      query = query.is("archived_at", null).is("account_archived_at", null)
    }
    if (stage) {
      if (!DEAL_STAGE_CODES.includes(stage)) {
        return apiError(422, "invalid_filter", `Nieznany etap leada: ${stage}.`, correlationId)
      }
      query = query.eq("stage", stage)
    }
    if (productType) {
      query = query.eq("product_type", productType)
    }
    if (owner === "me") {
      query = query.eq("owner_user_id", auth.actorUserId)
    } else if (owner === "none") {
      query = query.is("owner_user_id", null)
    } else if (owner) {
      if (!isUuid(owner)) {
        return apiError(422, "invalid_filter", "Parametr owner_user_id musi być UUID, 'me' lub 'none'.", correlationId)
      }
      query = query.eq("owner_user_id", owner)
    }
    if (source) {
      query = query.eq("source", source)
    }
    if (pattern) {
      const value = quoted(pattern)
      query = query.or(
        [
          `title.ilike.${value}`,
          `contact_name.ilike.${value}`,
          `company_name.ilike.${value}`,
          `account_name.ilike.${value}`,
          `contact_email.ilike.${value}`,
          `contact_phone.ilike.${value}`,
        ].join(","),
      )
    }

    const { data, error, count } = await query
      .order(sort, { ascending: asc, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać listy leadów.", correlationId)
    }

    return apiList(data ?? [], { total: count ?? 0, limit, offset }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function POST(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const parsed = await parseJsonBody(request, createLeadApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data

  if (body.stage === "lost" && !body.lost_reason) {
    return apiError(
      422,
      "validation_error",
      "Ustawienie etapu 'lost' wymaga podania lost_reason.",
      correlationId,
      { fields: { lost_reason: "Podaj powód przegranej." } },
    )
  }

  const created = await callAgentRpc<{
    status: string
    deal_id?: string
    account_id?: string
    contact_id?: string
    match_ids?: string[]
  }>(
    "create_manual_lead",
    {
      p_actor_user_id: auth.actorUserId,
      p_full_name: body.full_name,
      p_company_name: body.company_name ?? null,
      p_email: body.email ?? null,
      p_phone: body.phone ?? null,
      p_product_type: body.product_type ?? null,
      p_title: body.title ?? null,
      p_owner_user_id: body.owner_user_id ?? auth.actorUserId,
      p_confirm_duplicate: body.confirm_duplicate,
    },
    correlationId,
  )

  if (!created.ok) return created.response

  if (created.data?.status === "possible_duplicate") {
    return apiError(
      409,
      "possible_duplicate",
      "Istnieje już kontakt o tym adresie e-mail lub numerze telefonu. Przekaż confirm_duplicate: true, aby mimo to utworzyć nowego leada.",
      correlationId,
      { match_contact_ids: created.data.match_ids ?? [] },
    )
  }

  const dealId = created.data?.deal_id
  const accountId = created.data?.account_id

  if (!dealId) {
    return apiError(500, "unexpected_result", "Nie udało się utworzyć leada.", correlationId)
  }

  const admin = createAdminClient()

  // Opcjonalna zmiana etapu od razu przy utworzeniu
  if (body.stage && body.stage !== "new") {
    const { data: currentDeal } = await admin
      .from("deals")
      .select("version")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (currentDeal) {
      const staged = await callAgentRpc(
        "change_deal_stage",
        {
          p_actor_user_id: auth.actorUserId,
          p_deal_id: dealId,
          p_expected_version: currentDeal.version,
          p_stage: body.stage,
          p_lost_reason: body.lost_reason ?? null,
        },
        correlationId,
      )
      if (!staged.ok) return staged.response
    }
  }

  // Opcjonalna notatka startowa
  if (body.note && accountId) {
    const noted = await callAgentRpc(
      "add_note",
      {
        p_actor_user_id: auth.actorUserId,
        p_account_id: accountId,
        p_deal_id: dealId,
        p_body: body.note,
      },
      correlationId,
    )
    if (!noted.ok) return noted.response
  }

  // Powiadomienie push zespołu (best-effort)
  const contactPreview = [body.phone, body.email].filter(Boolean).join(" · ")
  await notifyWorkspaceAboutLead({
    workspaceId: auth.workspaceId,
    eventKey: `lead-api:${dealId}`,
    kind: "lead_manual",
    title: `Nowy lead: ${body.company_name || body.full_name}`,
    body: contactPreview || body.title || `Dodano przez API (${auth.actorName})`,
    targetPath: `/leads/${dealId}`,
    excludeUserId: auth.actorUserId,
  }).catch(() => undefined)

  const { data: leadRow } = await admin
    .from("lead_directory")
    .select("*")
    .eq("id", dealId)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle()

  return apiOk(
    leadRow ?? {
      id: dealId,
      account_id: accountId ?? null,
      contact_id: created.data?.contact_id ?? null,
    },
    correlationId,
    201,
  )
}
