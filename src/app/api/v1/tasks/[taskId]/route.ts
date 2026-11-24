import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  extractWarsawTimeFromDueAt,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateTaskApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(
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

  try {
    const admin = createAdminClient()
    const { data: task, error } = await admin
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać zadania.", correlationId)
    }
    if (!task) {
      return apiError(404, "not_found", "Nie znaleziono zadania.", correlationId)
    }

    const [links, account, deal] = await Promise.all([
      admin
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", task.id)
        .eq("workspace_id", auth.workspaceId),
      task.account_id
        ? admin
            .from("accounts")
            .select("display_name")
            .eq("id", task.account_id)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      task.deal_id
        ? admin
            .from("deals")
            .select("title")
            .eq("id", task.deal_id)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return apiOk(
      {
        ...task,
        due_time: extractWarsawTimeFromDueAt(task.due_at),
        assignee_ids: (links.data ?? []).map((l) => l.user_id),
        account_name: account.data?.display_name ?? null,
        deal_title: deal.data?.title ?? null,
      },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function PATCH(
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

  const parsed = await parseJsonBody(request, updateTaskApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const hasCoreFields =
    body.title !== undefined ||
    body.description !== undefined ||
    body.due_on !== undefined ||
    body.due_time !== undefined ||
    body.priority !== undefined ||
    body.status !== undefined ||
    body.account_id !== undefined ||
    body.deal_id !== undefined ||
    body.assignee_ids !== undefined

  if (!hasCoreFields && body.archived === undefined) {
    return apiError(422, "validation_error", "Podaj przynajmniej jedno pole zadania do aktualizacji.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const [{ data: current, error }, { data: currentAssignees }] = await Promise.all([
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

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać zadania.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono zadania.", correlationId)
    }

    let expectedVersion = body.version ?? current.version

    if (hasCoreFields) {
      const nextDueOn = body.due_on !== undefined ? body.due_on : current.due_on
      const existingDueTime = extractWarsawTimeFromDueAt(current.due_at)
      const nextDueTime =
        body.due_time !== undefined
          ? body.due_time
          : nextDueOn === null
            ? null
            : existingDueTime

      if (nextDueTime && !nextDueOn) {
        return apiError(
          422,
          "validation_error",
          "Godzina (due_time) wymaga podania daty (due_on).",
          correlationId,
          { fields: { due_time: "Godzina wymaga daty." } },
        )
      }

      const existingIds = (currentAssignees ?? []).map((a) => a.user_id)
      const nextAssigneeIds =
        body.assignee_ids !== undefined
          ? [...new Set(body.assignee_ids)]
          : existingIds.length > 0
            ? existingIds
            : [auth.actorUserId]

      const rpc = await callAgentRpc<string>(
        "save_task",
        {
          p_actor_user_id: auth.actorUserId,
          p_task_id: taskId,
          p_expected_version: expectedVersion,
          p_title: body.title ?? current.title,
          p_description:
            body.description !== undefined ? body.description : current.description,
          p_due_on: nextDueOn,
          p_due_time: nextDueTime,
          p_priority: body.priority ?? current.priority,
          p_status: body.status ?? current.status,
          p_account_id: body.account_id !== undefined ? body.account_id : current.account_id,
          p_deal_id: body.deal_id !== undefined ? body.deal_id : current.deal_id,
          p_deployment_id: null,
          p_assignee_ids: nextAssigneeIds,
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
          p_entity: "task",
          p_id: taskId,
          p_expected_version: expectedVersion,
          p_archived: body.archived,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
    }

    const [{ data: fresh }, { data: freshLinks }] = await Promise.all([
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
            assignee_ids: (freshLinks ?? []).map((l) => l.user_id),
          }
        : current,
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function DELETE(
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

    const rpc = await callAgentRpc(
      "set_archived",
      {
        p_actor_user_id: auth.actorUserId,
        p_entity: "task",
        p_id: taskId,
        p_expected_version: current.version,
        p_archived: true,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    return apiOk({ id: taskId, archived: true }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
