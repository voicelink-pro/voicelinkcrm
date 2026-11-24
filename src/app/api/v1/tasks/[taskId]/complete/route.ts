import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  extractWarsawTimeFromDueAt,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { completeTaskApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { taskId } = await context.params

  if (!isUuid(taskId)) {
    return apiError(400, "invalid_id", "Identyfikator zadania musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, completeTaskApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("tasks")
      .select("id, version, archived_at")
      .eq("id", taskId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać zadania.", correlationId)
    }
    if (!current || current.archived_at) {
      return apiError(404, "not_found", "Nie znaleziono zadania.", correlationId)
    }

    const rpc = await callAgentRpc<string>(
      "complete_task",
      {
        p_actor_user_id: auth.actorUserId,
        p_task_id: taskId,
        p_expected_version: parsed.data.version ?? current.version,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const [{ data: fresh }, { data: links }] = await Promise.all([
      admin
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .eq("workspace_id", auth.workspaceId)
        .maybeSingle(),
      admin
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", taskId)
        .eq("workspace_id", auth.workspaceId),
    ])

    return apiOk(
      fresh
        ? {
            ...fresh,
            due_time: extractWarsawTimeFromDueAt(fresh.due_at),
            assignee_ids: (links ?? []).map((l) => l.user_id),
          }
        : { id: taskId, status: "done" },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
