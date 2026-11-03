import { firstSearchParam } from "@/lib/auth/return-to"

export const taskPageSize = 25

const views = ["open", "today", "overdue", "upcoming", "done"] as const

export const taskStatusOptions = [
  ["todo", "Do zrobienia"],
  ["in_progress", "W trakcie"],
  ["done", "Ukończone"],
  ["cancelled", "Anulowane"],
] as const

export const taskPriorityOptions = [
  ["low", "Niski"],
  ["normal", "Normalny"],
  ["high", "Wysoki"],
] as const

export type TaskPriorityCode = (typeof taskPriorityOptions)[number][0]
export type TaskStatusCode = (typeof taskStatusOptions)[number][0]

export const taskPriorityStyles: Record<
  string,
  {
    dot: string
    badge: string
  }
> = {
  low: {
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
  },
  normal: {
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  },
  high: {
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
  },
}

export const taskStatusStyles: Record<
  string,
  {
    dot: string
    badge: string
  }
> = {
  todo: {
    dot: "bg-slate-400",
    badge: "border-border bg-muted/60 text-foreground",
  },
  in_progress: {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
  },
  done: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    dot: "bg-zinc-400",
    badge: "border-border bg-muted text-muted-foreground",
  },
}

export function taskPriorityStyle(code: string | null | undefined) {
  if (!code) return taskPriorityStyles.normal!
  return taskPriorityStyles[code] ?? taskPriorityStyles.normal!
}

export function taskStatusStyle(code: string | null | undefined) {
  if (!code) return taskStatusStyles.todo!
  return taskStatusStyles[code] ?? taskStatusStyles.todo!
}

const statusCodes = new Set<string>(taskStatusOptions.map(([code]) => code))
const priorityCodes = new Set<string>(taskPriorityOptions.map(([code]) => code))

const statusLabels = Object.fromEntries(taskStatusOptions)
const priorityLabels = Object.fromEntries(taskPriorityOptions)

export function taskStatusText(code: string | null | undefined) {
  if (!code) return "Nie uzupełniono"
  return statusLabels[code] ?? code
}

export function taskPriorityText(code: string | null | undefined) {
  if (!code) return "Nie uzupełniono"
  return priorityLabels[code] ?? code
}

export type TaskView = (typeof views)[number]

const userPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TaskQuery = {
  q: string
  assignee: "me" | "all"
  user: string
  view: TaskView
  status: string
  priority: string
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

export function parseTaskQuery(params: RawParams): TaskQuery {
  const assigneeParam = firstSearchParam(params.assignee)
  const viewParam = firstSearchParam(params.view) ?? ""
  const statusValue = firstSearchParam(params.status) ?? ""
  const priorityValue = firstSearchParam(params.priority) ?? ""
  const pageValue = Number(firstSearchParam(params.page))
  const userValue = (firstSearchParam(params.user) ?? "").trim()
  const qValue = (firstSearchParam(params.q) ?? "").trim().slice(0, 120)
  let assignee: TaskQuery["assignee"] = "me"

  if (assigneeParam === "all" || assigneeParam === "me") {
    assignee = assigneeParam === "all" ? "all" : "me"
  } else if (firstSearchParam(params.scope) === "all") {
    assignee = "all"
  }

  return {
    q: qValue,
    assignee,
    user: userPattern.test(userValue) ? userValue : "",
    view: views.includes(viewParam as TaskView) ? (viewParam as TaskView) : "open",
    status: statusCodes.has(statusValue) ? statusValue : "",
    priority: priorityCodes.has(priorityValue) ? priorityValue : "",
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  }
}

export function tasksHref(query: TaskQuery, patch: Partial<TaskQuery> = {}) {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()

  if (next.q) params.set("q", next.q)
  if (next.assignee === "all") params.set("assignee", "all")
  if (next.user) params.set("user", next.user)
  if (next.view !== "open") params.set("view", next.view)
  if (next.view === "today" && next.assignee === "me") params.set("assignee", "me")
  if (next.status) params.set("status", next.status)
  if (next.priority) params.set("priority", next.priority)
  if (next.page > 1) params.set("page", String(next.page))

  const search = params.toString()
  return search ? `/tasks?${search}` : "/tasks"
}

const openTaskStatuses = new Set(["todo", "in_progress"])

export function taskIsOverdue(
  status: string,
  dueOn: string | null | undefined,
  today: string,
) {
  const due = dueOn?.slice(0, 10) ?? ""
  return openTaskStatuses.has(status) && due !== "" && due < today
}
