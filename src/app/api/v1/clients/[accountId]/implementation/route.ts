import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateImplementationApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

async function handleUpdateImplementation(
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

  const parsed = await parseJsonBody(request, updateImplementationApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const nextStage = body.stage ?? body.implementation_stage
  const nextDueOn = body.due_on !== undefined ? body.due_on : body.implementation_due_on
  const nextNotes = body.notes !== undefined ? body.notes : body.implementation_notes

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("accounts")
      .select(
        "id, display_name, implementation_stage, implementation_due_on, implementation_notes",
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
        p_section: "implementation",
        p_implementation_stage: nextStage ?? current.implementation_stage,
        p_implementation_due_on:
          nextDueOn !== undefined ? nextDueOn : current.implementation_due_on,
        p_implementation_notes:
          nextNotes !== undefined ? nextNotes : current.implementation_notes,
        p_integration_systems: null,
        p_integration_docs_status: null,
        p_integration_notes: null,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const { data: updated } = await admin
      .from("accounts")
      .select(
        "id, display_name, implementation_stage, implementation_due_on, implementation_notes, version, updated_at",
      )
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(
      {
        account_id: accountId,
        previous_stage: current.implementation_stage,
        ...(updated ?? {}),
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
  return handleUpdateImplementation(request, context)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  return handleUpdateImplementation(request, context)
}
