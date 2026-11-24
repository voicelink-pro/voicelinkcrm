import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateDeploymentApiSchema } from "@/lib/api/schemas"
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
    const { data, error } = await admin
      .from("accounts")
      .select(
        "id, display_name, company_name, relationship, service_status, implementation_stage, implementation_due_on, implementation_notes, integration_systems, integration_docs_status, integration_notes, version, updated_at",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .is("archived_at", null)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych wdrożenia.", correlationId)
    }
    if (!data) {
      return apiError(404, "not_found", "Nie znaleziono klienta / wdrożenia.", correlationId)
    }

    return apiOk({ account_id: data.id, ...data }, correlationId)
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

  const parsed = await parseJsonBody(request, updateDeploymentApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const nextStage = body.stage ?? body.implementation_stage
  const nextDueOn = body.due_on !== undefined ? body.due_on : body.implementation_due_on
  const nextImplNotes = body.notes !== undefined ? body.notes : body.implementation_notes

  const hasImpl =
    nextStage !== undefined || nextDueOn !== undefined || nextImplNotes !== undefined
  const hasInteg =
    body.integration_systems !== undefined ||
    body.integration_docs_status !== undefined ||
    body.integration_notes !== undefined

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("accounts")
      .select(
        "id, display_name, implementation_stage, implementation_due_on, implementation_notes, integration_systems, integration_docs_status, integration_notes",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .is("archived_at", null)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych wdrożenia.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono klienta / wdrożenia.", correlationId)
    }

    if (hasImpl) {
      const rpc = await callAgentRpc(
        "save_account_dossier",
        {
          p_actor_user_id: auth.actorUserId,
          p_account_id: accountId,
          p_section: "implementation",
          p_implementation_stage: nextStage ?? current.implementation_stage,
          p_implementation_due_on:
            nextDueOn !== undefined ? nextDueOn : current.implementation_due_on,
          p_implementation_notes:
            nextImplNotes !== undefined ? nextImplNotes : current.implementation_notes,
          p_integration_systems: null,
          p_integration_docs_status: null,
          p_integration_notes: null,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
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
    }

    const { data: fresh } = await admin
      .from("accounts")
      .select(
        "id, display_name, company_name, implementation_stage, implementation_due_on, implementation_notes, integration_systems, integration_docs_status, integration_notes, version, updated_at",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(
      {
        account_id: accountId,
        previous_stage: current.implementation_stage,
        ...(fresh ?? {}),
      },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
