import Link from "next/link"
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Minus,
  PauseCircle,
  Target,
  TrendingDown,
  TrendingUp,
  Video,
} from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { FunnelRow, TaskPreview } from "@/lib/crm/dashboard"
import type { ConversionComparison } from "@/lib/crm/dashboard-query"
import { stageLabel } from "@/lib/crm/labels"
import { leadsHref, parseLeadQuery } from "@/lib/crm/lead-query"

function formatTaskTime(dueAt: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(dueAt))
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

export function TodayTasksCard({
  href,
  overdueHref,
  todayLabel,
  taskPerson,
  tasksToday,
  tasksOverdue,
  tasksHourlyOverdue,
  todayTasks,
}: {
  href: string
  overdueHref: string
  todayLabel: string
  taskPerson: string
  tasksToday: number
  tasksOverdue: number
  tasksHourlyOverdue: number
  todayTasks: TaskPreview[]
}) {
  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            <Link
              href={href}
              title="Niewykonane zadania z terminem równym dzisiejszej dacie w Warszawie. Jedno zadanie liczy się raz, także przy kilku osobach. Filtr okresu tego nie zmienia."
              className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
            >
              Zadania na dziś
              <ArrowUpRight className="size-4 text-primary" />
            </Link>
          </CardTitle>
          <p className="text-2xl font-bold tracking-tight text-primary sm:text-3xl tabular-nums">
            {tasksToday}
          </p>
          <CardDescription className="text-xs">
            Dzisiaj, {todayLabel} · {taskPerson}
          </CardDescription>
        </div>

        <CardAction className="flex flex-col items-end gap-1">
          {tasksOverdue > 0 ? (
            <Link href={overdueHref}>
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="size-3" />
                Zaległe: {tasksOverdue}
              </Badge>
            </Link>
          ) : (
            <Badge variant="secondary" className="bg-secondary text-primary">
              Brak zaległych
            </Badge>
          )}
          {tasksHourlyOverdue > 0 ? (
            <span className="text-[11px] font-medium text-destructive tabular-nums">
              Po godzinie: {tasksHourlyOverdue}
            </span>
          ) : null}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-center py-2">
        {todayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center">
            <CheckCircle2 className="size-6 text-primary/70" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">Brak zadań na dziś</p>
              <p className="text-xs text-muted-foreground">
                Wszystkie zaplanowane na dziś zadania zostały wykonane.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {todayTasks.slice(0, 4).map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs transition-colors hover:border-primary/30 hover:bg-secondary/60"
              >
                <span className="truncate font-medium text-foreground group-hover:text-primary">
                  {task.title}
                </span>
                {task.dueAt ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary tabular-nums">
                    <Clock className="size-3" />
                    {formatTaskTime(task.dueAt)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground">Dziś</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between text-xs">
        <span className="text-muted-foreground">
          {tasksOverdue > 0 ? (
            <Link href={overdueHref} className="font-medium text-destructive underline-offset-4 hover:underline">
              Zaległe zadania: {tasksOverdue}
            </Link>
          ) : (
            "Wszystkie poprzednie terminy domknięte"
          )}
        </span>
        <Link
          href={href}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Otwórz zadania →
        </Link>
      </CardFooter>
    </Card>
  )
}

export function CalendarMiniCard({ href }: { href: string }) {
  return (
    <Card
      size="sm"
      className="flex-1 justify-between bg-sidebar text-sidebar-foreground ring-sidebar-border"
    >
      <CardHeader className="pb-1">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-medium text-sidebar-foreground/85">
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-sidebar-foreground underline-offset-4 hover:underline"
            >
              Kalendarz zespołu
              <ArrowUpRight className="size-3.5 text-sidebar-foreground/80" />
            </Link>
          </CardTitle>
          <p className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Google Calendar
          </p>
        </div>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground">
            <CalendarClock className="size-4" />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent px-2 py-0.5 text-sidebar-foreground/90 transition-colors hover:bg-white/15"
          >
            Synchronizacja co 10 min · Otwórz →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export function ConversionMiniCard({
  href,
  conversion,
}: {
  href: string
  conversion: ConversionComparison
}) {
  const rateText =
    conversion.currentRate != null
      ? `${formatPercent(conversion.currentRate)}%`
      : "Brak danych"

  const ratioBadge =
    conversion.currentClosed > 0
      ? `${conversion.currentWon} z ${conversion.currentClosed}`
      : "0 zamknięć"

  return (
    <Card
      size="sm"
      className="flex-1 justify-between bg-sidebar text-sidebar-foreground ring-sidebar-border"
    >
      <CardHeader className="pb-1">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-medium text-sidebar-foreground/85">
            <Link
              href={href}
              title="Wygrane podzielone przez wygrane i przegrane zamknięte w okresie. Porównanie z poprzednim miesiącem kalendarzowym."
              className="inline-flex items-center gap-1 text-sidebar-foreground underline-offset-4 hover:underline"
            >
              Skuteczność zamknięć
              <ArrowUpRight className="size-3.5 text-sidebar-foreground/80" />
            </Link>
          </CardTitle>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-sidebar-foreground tabular-nums">
              {rateText}
            </p>
            <span className="inline-flex items-center rounded-md bg-sidebar-accent px-2 py-0.5 text-xs font-medium text-sidebar-foreground tabular-nums">
              {ratioBadge}
            </span>
          </div>
        </div>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground">
            <Target className="size-4" />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1 pt-0 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-sidebar-foreground/90">
          {conversion.deltaPoints != null ? (
            conversion.deltaPoints > 0.05 ? (
              <>
                <TrendingUp className="size-3.5 text-emerald-300" />
                <span>
                  +{formatPercent(conversion.deltaPoints)} pp vs {conversion.previousMonthLabel}
                </span>
              </>
            ) : conversion.deltaPoints < -0.05 ? (
              <>
                <TrendingDown className="size-3.5 text-red-300" />
                <span>
                  {formatPercent(conversion.deltaPoints)} pp vs {conversion.previousMonthLabel}
                </span>
              </>
            ) : (
              <>
                <Minus className="size-3.5 text-sidebar-foreground/75" />
                <span>
                  Bez zmian vs {conversion.previousMonthLabel} (0,0 pp)
                </span>
              </>
            )
          ) : conversion.previousRate != null ? (
            <>
              <Minus className="size-3.5 text-sidebar-foreground/75" />
              <span>
                Poprzedni mies. ({conversion.previousMonthLabel}):{" "}
                <span className="font-semibold text-sidebar-foreground">
                  {formatPercent(conversion.previousRate)}% ({conversion.previousWon} z {conversion.previousClosed})
                </span>
              </span>
            </>
          ) : (
            <>
              <Minus className="size-3.5 text-sidebar-foreground/75" />
              <span>
                Poprzedni mies. ({conversion.previousMonthLabel}): brak zamknięć
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const funnelStageStyles: Record<
  string,
  {
    dot: string
    bar: string
    badge: string
    borderHover: string
  }
> = {
  new: {
    dot: "bg-red-500",
    bar: "bg-red-500/12",
    badge: "border-red-200 bg-red-50 text-red-700",
    borderHover: "hover:border-red-200",
  },
  contact_attempt: {
    dot: "bg-orange-500",
    bar: "bg-orange-500/12",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    borderHover: "hover:border-orange-200",
  },
  conversation_done: {
    dot: "bg-amber-500",
    bar: "bg-amber-500/12",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    borderHover: "hover:border-amber-200",
  },
  meeting_scheduled: {
    dot: "bg-emerald-500",
    bar: "bg-emerald-500/12",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    borderHover: "hover:border-emerald-200",
  },
  meeting_done: {
    dot: "bg-teal-500",
    bar: "bg-teal-500/12",
    badge: "border-teal-200 bg-teal-50 text-teal-700",
    borderHover: "hover:border-teal-200",
  },
  offer_sent: {
    dot: "bg-blue-600",
    bar: "bg-blue-600/12",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    borderHover: "hover:border-blue-200",
  },
  negotiation: {
    dot: "bg-indigo-600",
    bar: "bg-indigo-600/12",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    borderHover: "hover:border-indigo-200",
  },
}

const defaultStageStyle = {
  dot: "bg-slate-400",
  bar: "bg-slate-400/12",
  badge: "border-border bg-muted text-foreground",
  borderHover: "hover:border-border",
}

export function FunnelCard({
  rows,
  owner,
}: {
  rows: FunnelRow[]
  owner: string
}) {
  const totalOpen = rows.reduce((sum, row) => sum + row.count, 0)
  const maxCount = Math.max(1, ...rows.map((row) => row.count))
  const allLeadsHref = leadsHref(parseLeadQuery({ owner }))

  return (
    <Card className="bg-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold text-foreground">
            <Link
              href={allLeadsHref}
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              Lejek sprzedaży
              <ArrowUpRight className="size-4 text-primary" />
            </Link>
          </CardTitle>
          <CardDescription className="text-xs">
            Stan obecny otwartych szans na poszczególnych etapach
          </CardDescription>
        </div>

        <CardAction>
          <Badge variant="secondary" className="bg-secondary text-primary tabular-nums">
            Razem: {totalOpen}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 pt-2">
        {rows.map((row) => {
          const style = funnelStageStyles[row.stage] ?? defaultStageStyle
          const widthPercent = row.count > 0 ? Math.max(8, Math.round((row.count / maxCount) * 100)) : 0
          const sharePercent = totalOpen > 0 ? Math.round((row.count / totalOpen) * 100) : 0

          return (
            <Link
              key={row.stage}
              href={leadsHref(parseLeadQuery({ stage: row.stage, owner }))}
              title={`Liczba otwartych szans na etapie „${stageLabel(row.stage)}”: ${row.count}`}
              className={cn(
                "group relative flex min-h-11 items-center justify-between overflow-hidden rounded-lg border border-border/70 bg-white px-3.5 py-2 transition-all hover:shadow-xs",
                style.borderHover,
              )}
            >
              {widthPercent > 0 ? (
                <div
                  aria-hidden
                  className={cn("pointer-events-none absolute inset-y-0 left-0 transition-all", style.bar)}
                  style={{ width: `${widthPercent}%` }}
                />
              ) : null}

              <div className="relative z-10 flex items-center gap-2.5">
                <span className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-white", style.dot)} />
                <span className="text-sm font-medium text-foreground group-hover:text-primary">
                  {stageLabel(row.stage)}
                </span>
              </div>

              <div className="relative z-10 flex items-center gap-2">
                {row.count > 0 && totalOpen > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {sharePercent}%
                  </span>
                ) : null}
                <span
                  className={cn(
                    "inline-flex min-w-7 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums",
                    row.count > 0 ? style.badge : "border-border/60 bg-muted/40 text-muted-foreground",
                  )}
                >
                  {row.count}
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

export type UpcomingMeetingItem = {
  id: string
  title: string
  accountName: string
  dayBadge: string
  dateLabel: string
  timeLabel: string
  durationLabel: string
  href?: string
}

export function UpcomingMeetingsCard({
  meetings = [],
}: {
  meetings?: UpcomingMeetingItem[]
}) {
  return (
    <Card className="flex flex-col justify-between bg-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold text-foreground">
            <Link
              href="/meetings"
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              Nadchodzące spotkania
              <ArrowUpRight className="size-4 text-primary" />
            </Link>
          </CardTitle>
          <CardDescription className="text-xs">
            Zaplanowane rozmowy i prezentacje z podłączonego kalendarza
          </CardDescription>
        </div>

        <CardAction>
          <Badge variant="secondary" className="gap-1.5 bg-secondary text-primary">
            <CalendarClock className="size-3.5" />
            Kalendarz
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-center py-3">
        {meetings.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/25 px-5 py-7 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <CalendarClock className="size-5" />
              </div>
              <div className="flex max-w-xs flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  Brak zaplanowanych spotkań
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Po podłączeniu kalendarza pojawią się tutaj nadchodzące rozmowy z klientami wraz z godziną i linkiem do spotkania.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 opacity-60">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-primary tabular-nums">
                    <span>10:00</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-medium text-foreground">
                      Prezentacja asystenta głosowego
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      Synchronizacja z Google Calendar · 30 min
                    </span>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Video className="size-3 text-primary" />
                  Wkrótce
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-primary tabular-nums">
                    <span>13:30</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-medium text-foreground">
                      Omówienie wdrożenia i oferty
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      Synchronizacja z Google Calendar · 45 min
                    </span>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Video className="size-3 text-primary" />
                  Wkrótce
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={meeting.href ?? `/meetings/${meeting.id}`}
                className="group flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-white px-3.5 py-2.5 transition-all hover:border-primary/30 hover:shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
                    <span>{meeting.timeLabel}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {meeting.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {meeting.accountName} · {meeting.dateLabel} · {meeting.durationLabel}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 bg-secondary text-primary">
                  {meeting.dayBadge}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between text-xs">
        <span className="text-muted-foreground">
          Synchronizacja z Google Calendar co 10 min
        </span>
        <Link
          href="/calendar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Otwórz kalendarz →
        </Link>
      </CardFooter>
    </Card>
  )
}

