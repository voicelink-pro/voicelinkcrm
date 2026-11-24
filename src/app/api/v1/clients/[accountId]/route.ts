import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateClientApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { accountId } = await context.params

  if (!isUuid(accountId)) {
    return apiError(400, "invalid_id", "Identyfikator klienta musi być poprawnym UUID.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data: account, error } = await admin
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych klienta.", correlationId)
    }
    if (!account) {
      return apiError(404, "not_found", "Nie znaleziono klienta.", correlationId)
    }

    const [contacts, deals, notes, tasks] = await Promise.all([
      admin
        .from("contacts")
        .select("id, full_name, job_title, email, phone_raw, phone_e164, is_primary, version, archived_at")
        .eq("account_id", account.id)
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .order("is_primary", { ascending: false })
        .order("full_name"),
      admin
        .from("deals")
        .select("id, title, stage, product_type, owner_user_id, version, archived_at, created_at")
        .eq("account_id", account.id)
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      admin
        .from("notes")
        .select("id, account_id, deal_id, body, created_at, updated_at, created_by")
        .eq("account_id", account.id)
        .eq("workspace_id", auth.workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("tasks")
        .select("id, title, description, due_on, due_at, status, priority, kind, deal_id, version, completed_at")
        .eq("account_id", account.id)
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(50),
    ])

    return apiOk(
      {
        account,
        contacts: contacts.data ?? [],
        deals: deals.data ?? [],
        notes: notes.data ?? [],
        tasks: tasks.data ?? [],
      },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { accountId } = await context.params

  if (!isUuid(accountId)) {
    return apiError(400, "invalid_id", "Identyfikator klienta musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, updateClientApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const hasCore =
    body.display_name !== undefined ||
    body.company_name !== undefined ||
    body.kind !== undefined ||
    body.website !== undefined ||
    body.nip !== undefined ||
    body.address !== undefined ||
    body.service_status !== undefined

  const hasImpl =
    body.implementation_stage !== undefined ||
    body.implementation_due_on !== undefined ||
    body.implementation_notes !== undefined

  const hasInteg =
    body.integration_systems !== undefined ||
    body.integration_docs_status !== undefined ||
    body.integration_notes !== undefined

  if (!hasCore && !hasImpl && !hasInteg && body.archived === undefined) {
    return apiError(422, "validation_error", "Podaj przynajmniej jedno pole do aktualizacji.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych klienta.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono klienta.", correlationId)
    }

    let expectedVersion = body.version ?? current.version

    if (hasCore) {
      const rpc = await callAgentRpc(
        "update_account",
        {
          p_actor_user_id: auth.actorUserId,
          p_account_id: accountId,
          p_expected_version: expectedVersion,
          p_display_name: body.display_name ?? current.display_name,
          p_company_name:
            body.company_name !== undefined ? body.company_name : current.company_name,
          p_kind: body.kind ?? current.kind,
          p_website: body.website !== undefined ? body.website : current.website,
          p_nip: body.nip !== undefined ? body.nip : current.nip,
          p_address: body.address !== undefined ? body.address : current.address,
          p_service_status: body.service_status ?? current.service_status,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
      expectedVersion += 1
    }

    if (hasImpl) {
      const rpc = await callAgentRpc(
        "save_account_dossier",
        {
          p_actor_user_id: auth.actorUserId,
          p_account_id: accountId,
          p_section: "implementation",
          p_implementation_stage:
            body.implementation_stage ?? current.implementation_stage,
          p_implementation_due_on:
            body.implementation_due_on !== undefined
              ? body.implementation_due_on
              : current.implementation_due_on,
          p_implementation_notes:
            body.implementation_notes !== undefined
              ? body.implementation_notes
              : current.implementation_notes,
          p_integration_systems: null,
          p_integration_docs_status: null,
          p_integration_notes: null,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
      expectedVersion += 1
    }

    if (hasInteg) {
      const rpc = await callAgentRpc(
        "save_account_dossier",
        {
          p_actor_user_id: auth.actorUserId,
          p_account_id: accountId,
          p_section: "integration",
          p_implementation_stage: null,
          p_implementation_due_on: null,
          p_implementation_notes: null,
          p_integration_systems:
            body.integration_systems !== undefined
              ? body.integration_systems
              : current.integration_systems,
          p_integration_docs_status:
            body.integration_docs_status ?? current.integration_docs_status,
          p_integration_notes:
            body.integration_notes !== undefined
              ? body.integration_notes
              : current.integration_notes,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
      expectedVersion += 1
    }

    if (body.archived !== undefined) {
      const rpc = await callAgentRpc(
        "set_archived",
        {
          p_actor_user_id: auth.actorUserId,
          p_entity: "account",
          p_id: accountId,
          p_expected_version: expectedVersion,
          p_archived: body.archived,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
    }

    const { data: fresh } = await admin
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(fresh ?? current, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
