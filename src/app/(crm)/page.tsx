import type { Metadata } from "next"

import { DashboardFilters } from "@/components/crm/dashboard-filters"
import {
  CalendarMiniCard,
  ConversionMiniCard,
  FunnelCard,
  TodayTasksCard,
  UpcomingMeetingsCard,
} from "@/components/crm/dashboard-top-cards"
import { GrossRevenueCard } from "@/components/crm/gross-revenue-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { parseDashboardQuery } from "@/lib/crm/dashboard-query"
import { loadDashboard } from "@/lib/crm/dashboard"
import { formatDay } from "@/lib/crm/format"
import { warsawToday } from "@/lib/crm/finance"
import { leadsHref, parseLeadQuery } from "@/lib/crm/lead-query"
import { listMembers } from "@/lib/crm/queries"
import { parseTaskQuery, tasksHref } from "@/lib/crm/task-query"
import { getWorkspaceGate } from "@/lib/auth/access"
import { RetryLoad } from "@/components/shared/retry-load"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const today = await warsawToday()
  const query = parseDashboardQuery(params, today)
  const gate = await getWorkspaceGate()
  const [{ snapshot, comparison, conversion, message }, members] = await Promise.all([
    loadDashboard(query.from, query.to, query.owner, query.source),
    listMembers(),
  ])
  const viewerId = gate.kind === "member" ? gate.userId : ""
  const personName = (userId: string) =>
    members.find((member) => member.userId === userId)?.fullName ?? "Wybrana osoba"
  const taskPerson = snapshot
    ? snapshot.taskUserId === viewerId
      ? "Zalogowana osoba"
      : personName(snapshot.taskUserId)
    : "Zalogowana osoba"
  const taskQuery = snapshot
    ? parseTaskQuery(
        snapshot.taskUserId === viewerId
          ? { view: "today", assignee: "me" }
          : { view: "today", assignee: "all", user: snapshot.taskUserId },
      )
    : parseTaskQuery({ view: "today", assignee: "me" })
  const overdueTaskQuery = snapshot
    ? parseTaskQuery(
        snapshot.taskUserId === viewerId
          ? { view: "overdue", assignee: "me" }
          : { view: "overdue", assignee: "all", user: snapshot.taskUserId },
      )
    : parseTaskQuery({ view: "overdue", assignee: "me" })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Kwoty pochodzą z ewidencji. To nie są wpłaty ani zysk.
          </p>
        </div>
        <DashboardFilters
          query={query}
          today={today}
          members={members}
          sources={snapshot?.sources ?? []}
        />
      </div>

      {message || !snapshot || !comparison || !conversion ? (
        <Alert variant="destructive">
          <AlertTitle>Dashboard niedostępny</AlertTitle>
          <AlertDescription>{message ?? "Nie udało się wczytać dashboardu."}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <GrossRevenueCard comparison={comparison} />
            <TodayTasksCard
              href={tasksHref(taskQuery)}
              overdueHref={tasksHref(overdueTaskQuery)}
              todayLabel={formatDay(snapshot.today)}
              taskPerson={taskPerson}
              tasksToday={snapshot.tasksToday}
              tasksOverdue={snapshot.tasksOverdue}
              tasksHourlyOverdue={snapshot.tasksHourlyOverdue}
              todayTasks={snapshot.todayTasks}
            />
            <div className="flex flex-col gap-3">
              <CalendarMiniCard href="/calendar" />
              <ConversionMiniCard
                href={leadsHref(
                  parseLeadQuery({
                    stage: "won",
                    owner: query.owner,
                    won_from: query.from,
                    won_to: query.to,
                  }),
                )}
                conversion={conversion}
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <UpcomingMeetingsCard />
            <FunnelCard rows={snapshot.funnel} owner={query.owner} />
          </div>
        </>
      )}
    </div>
  )
}
