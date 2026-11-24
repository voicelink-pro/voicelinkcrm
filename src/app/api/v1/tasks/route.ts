import {
  apiError,
  apiList,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  extractWarsawTimeFromDueAt,
  isUuid,
  parseJsonBody,
  parsePagination,
  searchPattern,
} from "@/lib/api/auth"
import {
  createTaskApiSchema,
  TASK_PRIORITY_CODES,
  TASK_STATUS_CODES,
} from "@/lib/api/schemas"
import { warsawToday } from "@/lib/crm/finance"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const OPEN_STATUSES = ["todo", "in_progress"]
const ALLOWED_VIEWS = new Set(["open", "today", "overdue", "upcoming", "done", "all"])

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const sp = url.searchParams
  const { limit, offset } = parsePagination(sp)

  const rawView = sp.get("view")?.trim() ?? "open"
  const view = ALLOWED_VIEWS.has(rawView) ? rawView : "open"
  const status = sp.get("status")?.trim() ?? ""
  const priority = sp.get("priority")?.trim() ?? ""
  const assignee = sp.get("assignee")?.trim() ?? sp.get("assignee_id")?.trim() ?? ""
  const accountId = sp.get("account_id")?.trim() ?? ""
  const dealId = sp.get("deal_id")?.trim() ?? ""
  const archived = sp.get("archived") === "true"
  const pattern = searchPattern(sp.get("q"))

  if (status && !(TASK_STATUS_CODES as readonly string[]).includes(status)) {
    return apiError(422, "invalid_filter", `Nieznany status zadania: ${status}.`, correlationId)
  }
  if (priority && !(TASK_PRIORITY_CODES as readonly string[]).includes(priority)) {
    return apiError(422, "invalid_filter", `Nieznany priorytet zadania: ${priority}.`, correlationId)
  }
  if (accountId && !isUuid(accountId)) {
    return apiError(422, "invalid_filter", "Parametr account_id musi być poprawnym UUID.", correlationId)
  }
  if (dealId && !isUuid(dealId)) {
    return apiError(422, "invalid_filter", "Parametr deal_id musi być poprawnym UUID.", correlationId)
  }

  let assigneeUserId: string | null = null
  if (assignee === "me") {
    assigneeUserId = auth.actorUserId
  } else if (assignee && assignee !== "all") {
    if (!isUuid(assignee)) {
      return apiError(422, "invalid_filter", "Parametr assignee musi być UUID, 'me' lub 'all'.", correlationId)
    }
    assigneeUserId = assignee
  }

  try {
    const admin = createAdminClient()
    let filteredTaskIds: string[] | null = null

    if (assigneeUserId) {
      const assigned = await admin
        .from("task_assignees")
        .select("task_id")
        .eq("workspace_id", auth.workspaceId)
        .eq("user_id", assigneeUserId)

      if (assigned.error) {
        return apiError(500, "database_error", "Nie udało się pobrać zadań.", correlationId)
      }
      filteredTaskIds = (assigned.data ?? []).map((row) => row.task_id)
      if (filteredTaskIds.length === 0) {
        return apiList([], { total: 0, limit, offset }, correlationId)
      }
    }

    const today = await warsawToday()

    let query = admin
      .from("tasks")
      .select(
        "id, title, description, due_on, due_at, status, priority, kind, account_id, deal_id, completed_at, completed_by, archived_at, version, created_at, updated_at",
        { count: "exact" },
      )
      .eq("workspace_id", auth.workspaceId)

    if (!archived) {
      query = query.is("archived_at", null)
    }
    if (filteredTaskIds) {
      query = query.in("id", filteredTaskIds)
    }
    if (accountId) query = query.eq("account_id", accountId)
    if (dealId) query = query.eq("deal_id", dealId)
    if (priority) query = query.eq("priority", priority)

    if (view === "today") query = query.eq("due_on", today)
    if (view === "overdue") query = query.lt("due_on", today)
    if (view === "upcoming") query = query.gt("due_on", today)

    if (status) {
      query = query.eq("status", status)
    } else if (view === "done") {
      query = query.eq("status", "done")
    } else if (view !== "all") {
      query = query.in("status", OPEN_STATUSES)
    }

    if (pattern) {
      query = query.ilike("title", pattern)
    }

    const ordered =
      view === "done"
        ? query.order("completed_at", { ascending: false, nullsFirst: false })
        : query.order("due_on", { ascending: true, nullsFirst: false })

    const { data, error, count } = await ordered
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać listy zadań.", correlationId)
    }

    const rows = data ?? []
    const taskIds = rows.map((r) => r.id)
    const accountIds = [
      ...new Set(rows.map((r) => r.account_id).filter((v): v is string => Boolean(v))),
    ]

    const [linksRes, accountsRes] = await Promise.all([
      taskIds.length
        ? admin
            .from("task_assignees")
            .select("task_id, user_id")
            .eq("workspace_id", auth.workspaceId)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
      accountIds.length
        ? admin
            .from("accounts")
            .select("id, display_name")
            .eq("workspace_id", auth.workspaceId)
            .in("id", accountIds)
        : Promise.resolve({ data: [] }),
    ])

    const accountNames = new Map((accountsRes.data ?? []).map((a) => [a.id, a.display_name]))
    const assigneesByTask = new Map<string, string[]>()
    for (const link of linksRes.data ?? []) {
      const list = assigneesByTask.get(link.task_id) ?? []
      list.push(link.user_id)
      assigneesByTask.set(link.task_id, list)
    }

    const items = rows.map((row) => ({
      ...row,
      due_time: extractWarsawTimeFromDueAt(row.due_at),
      account_name: row.account_id ? (accountNames.get(row.account_id) ?? null) : null,
      assignee_ids: assigneesByTask.get(row.id) ?? [],
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
  const parsed = await parseJsonBody(request, createTaskApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const assigneeIds =
    body.assignee_ids && body.assignee_ids.length > 0
      ? [...new Set(body.assignee_ids)]
      : [auth.actorUserId]

  const rpc = await callAgentRpc<string>(
    "save_task",
    {
      p_actor_user_id: auth.actorUserId,
      p_task_id: null,
      p_expected_version: null,
      p_title: body.title,
      p_description: body.description ?? null,
      p_due_on: body.due_on ?? null,
      p_due_time: body.due_time ?? null,
      p_priority: body.priority,
      p_status: body.status,
      p_account_id: body.account_id ?? null,
      p_deal_id: body.deal_id ?? null,
      p_deployment_id: null,
      p_assignee_ids: assigneeIds,
    },
    correlationId,
  )

  if (!rpc.ok) return rpc.response

  const taskId = rpc.data
  const admin = createAdminClient()
  const [{ data: task }, { data: links }] = await Promise.all([
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
    task
      ? {
          ...task,
          due_time: extractWarsawTimeFromDueAt(task.due_at),
          assignee_ids: (links ?? []).map((l) => l.user_id),
        }
      : { id: taskId, assignee_ids: assigneeIds },
    correlationId,
    201,
  )
}
