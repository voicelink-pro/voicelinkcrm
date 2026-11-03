import "server-only"

import { taskPageSize, type TaskQuery } from "@/lib/crm/task-query"
import { createClient } from "@/lib/supabase/server"

const readError = "Nie udało się wczytać danych."

export type TaskListRow = {
  id: string
  title: string
  description: string | null
  dueOn: string | null
  dueAt: string | null
  status: string
  priority: string
  kind: string
  accountId: string | null
  dealId: string | null
  version: number
  accountName: string | null
  assigneeIds: string[]
}

export type TaskRecord = {
  id: string
  title: string
  description: string | null
  dueOn: string | null
  dueAt: string | null
  status: string
  priority: string
  kind: string
  accountId: string | null
  dealId: string | null
  completedAt: string | null
  completedBy: string | null
  version: number
  assigneeIds: string[]
  accountName: string | null
  dealTitle: string | null
  originLabel: string | null
}

export type TaskFormOptions = {
  accounts: { id: string; displayName: string }[]
  deals: { id: string; title: string; accountId: string }[]
}

const openTaskStatuses = ["todo", "in_progress"]

export async function listTasks(query: TaskQuery, today: string, userId: string) {
  const supabase = await createClient()
  let ids: string[] | null = null

  const assigneeId = query.user || (query.assignee === "me" ? userId : "")

  if (assigneeId) {
    const assigned = await supabase.from("task_assignees").select("task_id").eq("user_id", assigneeId)
    if (assigned.error) {
      return { rows: [] as TaskListRow[], count: 0, error: readError }
    }
    ids = (assigned.data ?? []).map((row) => row.task_id)
    if (ids.length === 0) {
      return { rows: [] as TaskListRow[], count: 0, error: null }
    }
  }

  if (query.view === "done" && query.status && query.status !== "done") {
    return { rows: [] as TaskListRow[], count: 0, error: null }
  }
  if (query.view !== "done" && query.status && !openTaskStatuses.includes(query.status)) {
    return { rows: [] as TaskListRow[], count: 0, error: null }
  }

  const from = (query.page - 1) * taskPageSize
  let request = supabase
    .from("tasks")
    .select(
      "id, title, description, due_on, due_at, status, priority, kind, account_id, deal_id, version, completed_at",
      { count: "exact" },
    )
    .is("archived_at", null)

  if (ids) {
    request = request.in("id", ids)
  }
  if (query.view === "today") request = request.eq("due_on", today)
  if (query.view === "overdue") request = request.lt("due_on", today)
  if (query.view === "upcoming") request = request.gt("due_on", today)
  if (query.view === "done") {
    request = request.eq("status", "done")
  } else {
    request = request.in("status", query.status ? [query.status] : openTaskStatuses)
  }
  if (query.priority) request = request.eq("priority", query.priority)

  const needle = query.q.replace(/[%_\\]/g, "").trim()
  if (needle) {
    request = request.ilike("title", `%${needle}%`)
  }

  request =
    query.view === "done"
      ? request.order("completed_at", { ascending: false, nullsFirst: false })
      : request.order("due_on", { ascending: true, nullsFirst: false })

  const { data, error, count } = await request.order("id").range(from, from + taskPageSize - 1)
  if (error) {
    return { rows: [] as TaskListRow[], count: 0, error: readError }
  }

  const taskIds = (data ?? []).map((row) => row.id)
  const accountIds = [...new Set((data ?? []).map((row) => row.account_id).filter(Boolean))] as string[]
  const [links, accounts] = await Promise.all([
    taskIds.length
      ? supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase.from("accounts").select("id, display_name").in("id", accountIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (links.error || accounts.error) {
    return { rows: [] as TaskListRow[], count: 0, error: readError }
  }

  const names = new Map((accounts.data ?? []).map((row) => [row.id, row.display_name]))
  const grouped = new Map<string, string[]>()
  for (const link of links.data ?? []) {
    const current = grouped.get(link.task_id) ?? []
    current.push(link.user_id)
    grouped.set(link.task_id, current)
  }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dueOn: row.due_on,
      dueAt: row.due_at,
      status: row.status,
      priority: row.priority,
      kind: row.kind,
      accountId: row.account_id,
      dealId: row.deal_id,
      version: row.version,
      accountName: row.account_id ? (names.get(row.account_id) ?? null) : null,
      assigneeIds: grouped.get(row.id) ?? [],
    })),
    count: count ?? 0,
    error: null,
  }
}

export async function listTaskFormOptions(): Promise<TaskFormOptions> {
  const supabase = await createClient()
  const [accounts, deals] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, display_name")
      .is("archived_at", null)
      .order("display_name"),
    supabase.from("deals").select("id, title, account_id").is("archived_at", null).order("title"),
  ])

  return {
    accounts: (accounts.data ?? []).map((row) => ({ id: row.id, displayName: row.display_name })),
    deals: (deals.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      accountId: row.account_id,
    })),
  }
}

export async function getTask(taskId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .is("archived_at", null)
    .maybeSingle()

  if (error || !data) {
    return { task: null as TaskRecord | null, error: error ? readError : null }
  }

  const [assignees, account, deal, origin] = await Promise.all([
    supabase.from("task_assignees").select("user_id").eq("task_id", data.id),
    data.account_id
      ? supabase.from("accounts").select("display_name").eq("id", data.account_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.deal_id
      ? supabase.from("deals").select("title").eq("id", data.deal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.origin_activity_id
      ? supabase
          .from("activities")
          .select("activity_type")
          .eq("id", data.origin_activity_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (assignees.error || account.error || deal.error || origin.error) {
    return { task: null as TaskRecord | null, error: readError }
  }

  const originType = origin.data?.activity_type ?? null

  return {
    task: {
      id: data.id,
      title: data.title,
      description: data.description,
      dueOn: data.due_on,
      dueAt: data.due_at,
      status: data.status,
      priority: data.priority,
      kind: data.kind,
      accountId: data.account_id,
      dealId: data.deal_id,
      completedAt: data.completed_at,
      completedBy: data.completed_by,
      version: data.version,
      assigneeIds: (assignees.data ?? []).map((row) => row.user_id),
      accountName: account.data?.display_name ?? null,
      dealTitle: deal.data?.title ?? null,
      originLabel:
        data.kind === "follow_up" || originType === "call_no_answer" ? "Próba kontaktu" : null,
    } satisfies TaskRecord,
    error: null,
  }
}
