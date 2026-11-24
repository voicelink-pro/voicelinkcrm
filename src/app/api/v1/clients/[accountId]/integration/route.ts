import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateIntegrationApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

async function handleUpdateIntegration(
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

  const parsed = await parseJsonBody(request, updateIntegrationApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const nextSystems =
    body.systems !== undefined ? body.systems : body.integration_systems
  const nextDocsStatus = body.docs_status ?? body.integration_docs_status
  const nextNotes = body.notes !== undefined ? body.notes : body.integration_notes

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("accounts")
      .select(
        "id, display_name, integration_systems, integration_docs_status, integration_notes",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych klienta.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono klienta.", correlationId)
    }

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
          nextSystems !== undefined ? nextSystems : current.integration_systems,
        p_integration_docs_status:
          nextDocsStatus ?? current.integration_docs_status,
        p_integration_notes:
          nextNotes !== undefined ? nextNotes : current.integration_notes,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const { data: updated } = await admin
      .from("accounts")
      .select(
        "id, display_name, integration_systems, integration_docs_status, integration_notes, version, updated_at",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(updated ?? { id: accountId }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  return handleUpdateIntegration(request, context)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  return handleUpdateIntegration(request, context)
}
