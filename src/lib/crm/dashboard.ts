import "server-only"

import { getWorkspaceGate } from "@/lib/auth/access"
import {
  buildConversionComparison,
  previousMonthBounds,
  type ConversionComparison,
} from "@/lib/crm/dashboard-query"
import {
  addCalendarDays,
  buildRevenueComparison,
  startOfIsoWeek,
  type RevenueComparisonData,
  type RevenueEntryAmount,
} from "@/lib/crm/revenue-comparison"
import { createAdminClient } from "@/lib/supabase/admin"

export type FunnelRow = { stage: string; count: number }
export type ChartRow = {
  month: string
  setupCents: number
  subscriptionCents: number
  totalCents: number
}
export type TaskPreview = { id: string; title: string; dueOn: string; dueAt: string | null }
export type DeploymentPreview = { id: string; name: string; dueOn: string; status: string }
export type MeetingPreview = { id: string; title: string; startedAt: string }

export type DashboardSnapshot = {
  today: string
  periodFrom: string
  periodTo: string
  ownerUserId: string | null
  taskUserId: string
  source: string | null
  workerRunning: boolean
  lastRevenueAt: string | null
  grossCents: number
  setupCents: number
  subscriptionCents: number
  otherCents: number
  activeSubscriptionCents: number
  openDeployments: number
  pausedDeployments: number
  overdueDeployments: number
  tasksToday: number
  tasksOverdue: number
  tasksHourlyOverdue: number
  newLeads: number
  wonFinalized: number
  wonClosed: number
  lostClosed: number
  openSetupCents: number
  openSetupMissing: number
  openMonthlyCents: number
  openMonthlyMissing: number
  funnel: FunnelRow[]
  chart: ChartRow[]
  todayTasks: TaskPreview[]
  overdueDeploymentRows: DeploymentPreview[]
  meetings: MeetingPreview[]
  sources: string[]
}

const readError = "Nie udało się wczytać dashboardu."
const periodError = "Zakres dat jest niepoprawny."

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) {
      return parsed
    }
  }
  return null
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function day(value: unknown) {
  const parsed = text(value)?.slice(0, 10) ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot | null {
  const payload = record(value)
  if (!payload) {
    return null
  }

  const numbers = [
    "gross_cents",
    "setup_cents",
    "subscription_cents",
    "other_cents",
    "active_subscription_cents",
    "open_deployments",
    "paused_deployments",
    "overdue_deployments",
    "tasks_today",
    "tasks_overdue",
    "tasks_hourly_overdue",
    "new_leads",
    "won_finalized",
    "won_closed",
    "lost_closed",
    "open_setup_cents",
    "open_setup_missing",
    "open_monthly_cents",
    "open_monthly_missing",
  ] as const
  const parsedNumbers = Object.fromEntries(
    numbers.map((key) => [key, integer(payload[key])]),
  ) as Record<(typeof numbers)[number], number | null>

  if (Object.values(parsedNumbers).some((item) => item == null)) {
    return null
  }

  const today = day(payload.today)
  const periodFrom = day(payload.period_from)
  const periodTo = day(payload.period_to)
  const taskUserId = text(payload.task_user_id)
  if (!today || !periodFrom || !periodTo || !taskUserId || !Array.isArray(payload.chart)) {
    return null
  }

  const chart = payload.chart.flatMap((item) => {
    const row = record(item)
    const month = row ? day(row.month) : null
    const setupCents = row ? integer(row.setup_cents) : null
    const subscriptionCents = row ? integer(row.subscription_cents) : null
    const totalCents = row ? integer(row.total_cents) : null
    if (!row || !month || setupCents == null || subscriptionCents == null || totalCents == null) {
      return []
    }
    return [{ month, setupCents, subscriptionCents, totalCents }]
  })
  if (chart.length !== payload.chart.length) {
    return null
  }

  const funnel = Array.isArray(payload.funnel)
    ? payload.funnel.flatMap((item) => {
        const row = record(item)
        const stage = row ? text(row.stage) : null
        const count = row ? integer(row.count) : null
        if (!stage || count == null) {
          return []
        }
        return [{ stage, count }]
      })
    : []
  if (!Array.isArray(payload.funnel) || funnel.length !== payload.funnel.length) {
    return null
  }

  const todayTasks = Array.isArray(payload.today_tasks)
    ? payload.today_tasks.flatMap((item) => {
        const row = record(item)
        const id = row ? text(row.id) : null
        const title = row ? text(row.title) : null
        const dueOn = row ? day(row.due_on) : null
        if (!id || !title || !dueOn) {
          return []
        }
        return [{ id, title, dueOn, dueAt: row ? text(row.due_at) : null }]
      })
    : []

  const overdueDeploymentRows = Array.isArray(payload.overdue_deployment_rows)
    ? payload.overdue_deployment_rows.flatMap((item) => {
        const row = record(item)
        const id = row ? text(row.id) : null
        const name = row ? text(row.name) : null
        const dueOn = row ? day(row.due_on) : null
        const status = row ? text(row.status) : null
        if (!id || !name || !dueOn || !status) {
          return []
        }
        return [{ id, name, dueOn, status }]
      })
    : []

  const meetings = Array.isArray(payload.meetings)
    ? payload.meetings.flatMap((item) => {
        const row = record(item)
        const id = row ? text(row.id) : null
        const title = row ? text(row.title) : null
        const startedAt = row ? text(row.started_at) : null
        if (!id || !title || !startedAt) {
          return []
        }
        return [{ id, title, startedAt }]
      })
    : []

  const sources = Array.isArray(payload.sources)
    ? payload.sources.flatMap((item) => (typeof item === "string" ? [item] : []))
    : []

  return {
    today,
    periodFrom,
    periodTo,
    ownerUserId: text(payload.owner_user_id),
    taskUserId,
    source: text(payload.source),
    workerRunning: payload.worker_running === true,
    lastRevenueAt: text(payload.last_revenue_at),
    grossCents: parsedNumbers.gross_cents as number,
    setupCents: parsedNumbers.setup_cents as number,
    subscriptionCents: parsedNumbers.subscription_cents as number,
    otherCents: parsedNumbers.other_cents as number,
    activeSubscriptionCents: parsedNumbers.active_subscription_cents as number,
    openDeployments: parsedNumbers.open_deployments as number,
    pausedDeployments: parsedNumbers.paused_deployments as number,
    overdueDeployments: parsedNumbers.overdue_deployments as number,
    tasksToday: parsedNumbers.tasks_today as number,
    tasksOverdue: parsedNumbers.tasks_overdue as number,
    tasksHourlyOverdue: parsedNumbers.tasks_hourly_overdue as number,
    newLeads: parsedNumbers.new_leads as number,
    wonFinalized: parsedNumbers.won_finalized as number,
    wonClosed: parsedNumbers.won_closed as number,
    lostClosed: parsedNumbers.lost_closed as number,
    openSetupCents: parsedNumbers.open_setup_cents as number,
    openSetupMissing: parsedNumbers.open_setup_missing as number,
    openMonthlyCents: parsedNumbers.open_monthly_cents as number,
    openMonthlyMissing: parsedNumbers.open_monthly_missing as number,
    funnel,
    chart,
    todayTasks,
    overdueDeploymentRows,
    meetings,
    sources,
  }
}

export async function loadDashboard(from: string, to: string, owner: string, source: string) {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return {
      snapshot: null as DashboardSnapshot | null,
      comparison: null as RevenueComparisonData | null,
      conversion: null as ConversionComparison | null,
      message: "Brak dostępu do tego obszaru roboczego.",
    }
  }

  try {
    const admin = createAdminClient()
    const prevBounds = previousMonthBounds(from)
    const [currentRes, prevRes] = await Promise.all([
      admin.schema("private").rpc("dashboard_snapshot" as never, {
        p_actor_user_id: gate.userId,
        p_from: from,
        p_to: to,
        p_owner_user_id: owner || null,
        p_source: source || null,
      } as never),
      prevBounds
        ? admin.schema("private").rpc("dashboard_snapshot" as never, {
            p_actor_user_id: gate.userId,
            p_from: prevBounds.from,
            p_to: prevBounds.to,
            p_owner_user_id: owner || null,
            p_source: source || null,
          } as never)
        : Promise.resolve({ data: null as unknown, error: null }),
    ])

    const { data, error } = currentRes

    if (error) {
      const message = error.message ?? ""
      return {
        snapshot: null as DashboardSnapshot | null,
        comparison: null as RevenueComparisonData | null,
        conversion: null as ConversionComparison | null,
        message: message.includes("period_invalid") ? periodError : readError,
      }
    }

    const snapshot = parseDashboardSnapshot(data)
    if (!snapshot) {
      return {
        snapshot: null as DashboardSnapshot | null,
        comparison: null as RevenueComparisonData | null,
        conversion: null as ConversionComparison | null,
        message: readError,
      }
    }

    const prevSnapshot = prevRes.data ? parseDashboardSnapshot(prevRes.data) : null
    const conversion = buildConversionComparison(
      snapshot.wonClosed,
      snapshot.lostClosed,
      prevSnapshot?.wonClosed ?? 0,
      prevSnapshot?.lostClosed ?? 0,
      prevBounds?.from ?? snapshot.periodFrom,
    )

    const currentWeekMonday = startOfIsoWeek(snapshot.today)
    const earliestWeekStart = addCalendarDays(currentWeekMonday, -35)
    const currentWeekSunday = addCalendarDays(currentWeekMonday, 6)

    const { data: recentRevenue } = await admin
      .from("revenue_entries")
      .select("effective_on, amount_signed_cents")
      .eq("workspace_id", gate.workspaceId)
      .gte("effective_on", earliestWeekStart)
      .lte("effective_on", currentWeekSunday)

    const entries: RevenueEntryAmount[] = Array.isArray(recentRevenue)
      ? recentRevenue.flatMap((item) => {
          const effectiveOn = day(item.effective_on)
          const amountSignedCents = integer(item.amount_signed_cents)
          if (!effectiveOn || amountSignedCents == null) {
            return []
          }
          return [{ effectiveOn, amountSignedCents }]
        })
      : []

    const comparison = buildRevenueComparison(snapshot.today, snapshot.chart, entries)

    return { snapshot, comparison, conversion, message: null }
  } catch {
    return {
      snapshot: null as DashboardSnapshot | null,
      comparison: null as RevenueComparisonData | null,
      conversion: null as ConversionComparison | null,
      message: readError,
    }
  }
}
