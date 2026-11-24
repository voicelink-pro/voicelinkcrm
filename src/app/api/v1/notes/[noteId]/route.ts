import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateNoteApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { noteId } = await context.params

  if (!isUuid(noteId)) {
    return apiError(400, "invalid_id", "Identyfikator notatki musi być poprawnym UUID.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("notes")
      .select("id, account_id, deal_id, body, created_at, updated_at, created_by, updated_by, version")
      .eq("id", noteId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać notatki.", correlationId)
    }
    if (!data) {
      return apiError(404, "not_found", "Nie znaleziono notatki.", correlationId)
    }

    return apiOk(data, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { noteId } = await context.params

  if (!isUuid(noteId)) {
    return apiError(400, "invalid_id", "Identyfikator notatki musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, updateNoteApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (!existing) {
      return apiError(404, "not_found", "Nie znaleziono notatki.", correlationId)
    }

    const rpc = await callAgentRpc<string>(
      "update_note",
      {
        p_actor_user_id: auth.actorUserId,
        p_note_id: noteId,
        p_body: parsed.data.body,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const { data: updated } = await admin
      .from("notes")
      .select("id, account_id, deal_id, body, created_at, updated_at, created_by, updated_by, version")
      .eq("id", noteId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(updated ?? { id: noteId, body: parsed.data.body }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { noteId } = await context.params

  if (!isUuid(noteId)) {
    return apiError(400, "invalid_id", "Identyfikator notatki musi być poprawnym UUID.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (!existing) {
      return apiError(404, "not_found", "Nie znaleziono notatki.", correlationId)
    }

    const rpc = await callAgentRpc(
      "delete_note",
      {
        p_actor_user_id: auth.actorUserId,
        p_note_id: noteId,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    return apiOk({ id: noteId, deleted: true }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
