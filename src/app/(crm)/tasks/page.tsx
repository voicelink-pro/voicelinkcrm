import type { Metadata } from "next"
import Link from "next/link"
import {
  AlertCircleIcon,
  Building2Icon,
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import {
  NewTaskDialog,
  TaskAssigneePill,
  TaskCompleteButton,
  TaskPriorityPill,
  TaskStatusPill,
} from "@/components/crm/task-quick-controls"
import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getWorkspaceGate } from "@/lib/auth/access"
import { warsawToday } from "@/lib/crm/finance"
import { formatDay } from "@/lib/crm/format"
import { listMembers } from "@/lib/crm/queries"
import { listTaskFormOptions, listTasks } from "@/lib/crm/task-read"
import {
  parseTaskQuery,
  taskIsOverdue,
  taskPageSize,
  taskPriorityOptions,
  taskPriorityStyle,
  tasksHref,
  type TaskQuery,
} from "@/lib/crm/task-query"

export const metadata: Metadata = {
  title: "Zadania",
}

const views: [TaskQuery["view"], string][] = [
  ["open", "Otwarte"],
  ["today", "Dzisiaj"],
  ["overdue", "Zaległe"],
  ["upcoming", "Nadchodzące"],
  ["done", "Ukończone"],
]

function warsawClock(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseTaskQuery(await searchParams)
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Brak dostępu</AlertTitle>
        <AlertDescription>Zadania są dostępne po zalogowaniu do obszaru roboczego.</AlertDescription>
      </Alert>
    )
  }

  const today = await warsawToday()
  const [members, listed, options] = await Promise.all([
    listMembers(),
    listTasks(query, today, gate.userId),
    listTaskFormOptions(),
  ])
  const pages = Math.max(1, Math.ceil(listed.count / taskPageSize))
  const hasActiveFilters = Boolean(
    query.q ||
      query.priority ||
      query.status ||
      query.user ||
      query.view !== "open" ||
      query.assignee !== "me",
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Górny wiersz: Tytuł Zadania + kompaktowe filtry widoku i użytkowników po prawej + przycisk Nowe zadanie */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Zadania</h1>
            <p className="text-sm text-muted-foreground">
              {listed.count} {taskCountLabel(listed.count)}
            </p>
          </div>

          {/* Kompaktowy przełącznik widoku na wysokości napisu Zadania */}
          <nav
            aria-label="Widok zadań"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            {views.map(([viewCode, label]) => {
              const active = query.view === viewCode
              return (
                <Link
                  key={viewCode}
                  href={tasksHref(query, { view: viewCode, page: 1 })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? viewCode === "overdue"
                        ? "bg-destructive text-white shadow-2xs"
                        : "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {viewCode === "overdue" ? <AlertCircleIcon className="size-3" /> : null}
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Kompaktowy filtr przypisanego użytkownika (Moje / Wszyscy / konkretna osoba) */}
          <nav
            aria-label="Filtr przypisanej osoby"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            <Link
              href={tasksHref(query, { assignee: "me", user: "", page: 1 })}
              className={cn(
                "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                query.assignee === "me" && !query.user
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              Moje
            </Link>
            <Link
              href={tasksHref(query, { assignee: "all", user: "", page: 1 })}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                query.assignee === "all" && !query.user
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <UsersIcon className="size-3" />
              Wszyscy
            </Link>
            {members.map((member) => {
              const active = query.user === member.userId
              const firstName = member.fullName.split(" ")[0] || member.fullName
              return (
                <Link
                  key={member.userId}
                  href={tasksHref(query, {
                    assignee: "all",
                    user: active ? "" : member.userId,
                    page: 1,
                  })}
                  title={`Pokaż zadania przypisane do: ${member.fullName}`}
                  className={cn(
                    "hidden h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:inline-flex",
                    active
                      ? "bg-secondary font-semibold text-primary ring-1 ring-primary/25"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {firstName}
                </Link>
              )
            })}
          </nav>

          <NewTaskDialog
            currentUserId={gate.userId}
            members={members}
            accounts={options.accounts}
            deals={options.deals}
          />
        </div>
      </div>

      {/* Drugi kompaktowy pasek: Priorytety z kolorowymi kropkami + wyszukiwarka */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav
            aria-label="Filtr priorytetu"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            <Link
              href={tasksHref(query, { priority: "", page: 1 })}
              className={cn(
                "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                !query.priority
                  ? "bg-secondary font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              Każdy priorytet
            </Link>
            {taskPriorityOptions.map(([code, label]) => {
              const active = query.priority === code
              const style = taskPriorityStyle(code)
              return (
                <Link
                  key={code}
                  href={tasksHref(query, { priority: active ? "" : code, page: 1 })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? cn(style.badge, "shadow-2xs")
                      : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <form action="/tasks" className="flex items-center gap-1.5">
          {query.assignee === "all" ? <input type="hidden" name="assignee" value="all" /> : null}
          {query.user ? <input type="hidden" name="user" value={query.user} /> : null}
          {query.view !== "open" ? <input type="hidden" name="view" value={query.view} /> : null}
          {query.priority ? <input type="hidden" name="priority" value={query.priority} /> : null}
          {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query.q}
              placeholder="Szukaj zadania..."
              className="h-9 w-48 pl-8 text-xs sm:w-64"
            />
          </div>
          <Button type="submit" variant="outline" size="lg">
            Szukaj
          </Button>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="icon-lg"
              title="Wyczyść filtry"
              aria-label="Wyczyść filtry"
              nativeButton={false}
              render={<Link href="/tasks" />}
            >
              <XIcon />
            </Button>
          ) : null}
        </form>
      </div>

      {listed.error ? (
        <Alert variant="destructive">
          <AlertTitle>Lista niedostępna</AlertTitle>
          <AlertDescription>{listed.error}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : null}

      {listed.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Brak zadań</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Żadne zadanie nie pasuje do wybranych filtrów."
                : "W tym widoku nie ma otwartych zadań. Kliknij „Nowe zadanie”, aby dodać pierwsze."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-2xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-11 pl-4" />
                  <TableHead>Zadanie i klient</TableHead>
                  <TableHead>Termin</TableHead>
                  <TableHead>Priorytet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Przypisany użytkownik</TableHead>
                  <TableHead className="w-14 pr-4 text-right">Karta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.rows.map((row) => {
                  const taskKey = `${row.id}-${row.version}`
                  return (
                    <TableRow key={row.id} className="group">
                      <TableCell className="pl-4">
                        <TaskCompleteButton key={`chk-${taskKey}`} task={row} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/tasks/${row.id}`}
                              className={cn(
                                "font-semibold underline-offset-4 group-hover:text-primary hover:underline",
                                row.status === "done"
                                  ? "line-through text-muted-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {row.title}
                            </Link>
                            {row.kind === "follow_up" ? (
                              <Badge variant="outline" className="text-[10px]">
                                Follow-up
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {row.accountId && row.accountName ? (
                              <Link
                                href={`/accounts/${row.accountId}`}
                                className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-primary hover:underline"
                              >
                                <Building2Icon className="size-3" />
                                {row.accountName}
                              </Link>
                            ) : (
                              <span>Zadanie ogólne</span>
                            )}
                            {row.description ? (
                              <span className="max-w-xs truncate text-muted-foreground/80">
                                · {row.description}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TaskDue row={row} today={today} />
                      </TableCell>
                      <TableCell>
                        <TaskPriorityPill key={`prio-${taskKey}`} task={row} />
                      </TableCell>
                      <TableCell>
                        <TaskStatusPill key={`stat-${taskKey}`} task={row} />
                      </TableCell>
                      <TableCell>
                        <TaskAssigneePill key={`asgn-${taskKey}`} task={row} members={members} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Otwórz szczegóły zadania: ${row.title}`}
                          title="Szczegóły i edycja zadania"
                          nativeButton={false}
                          render={<Link href={`/tasks/${row.id}`} />}
                          className="text-muted-foreground hover:bg-secondary hover:text-primary"
                        >
                          <EyeIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {listed.rows.map((row) => {
              const taskKey = `${row.id}-${row.version}`
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <TaskCompleteButton key={`m-chk-${taskKey}`} task={row} />
                      <div className="flex flex-col min-w-0">
                        <Link
                          href={`/tasks/${row.id}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {row.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {row.accountName ?? "Zadanie ogólne"}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      nativeButton={false}
                      render={<Link href={`/tasks/${row.id}`} />}
                      aria-label={`Otwórz zadanie: ${row.title}`}
                    >
                      <EyeIcon />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                    <TaskDue row={row} today={today} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TaskPriorityPill key={`m-prio-${taskKey}`} task={row} />
                      <TaskStatusPill key={`m-stat-${taskKey}`} task={row} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Przypisani:</span>
                    <TaskAssigneePill key={`m-asgn-${taskKey}`} task={row} members={members} />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {pages > 1 ? (
        <div className="flex gap-2">
          {query.page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={tasksHref(query, { page: query.page - 1 })} />}
            >
              Poprzednia
            </Button>
          ) : null}
          {query.page < pages ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={tasksHref(query, { page: query.page + 1 })} />}
            >
              Następna
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TaskDue({
  row,
  today,
}: {
  row: { dueOn: string | null; dueAt: string | null; status: string; kind: string }
  today: string
}) {
  const overdue = taskIsOverdue(row.status, row.dueOn, today)
  const isToday = row.dueOn === today && row.status !== "done" && row.status !== "cancelled"
  const clock = warsawClock(row.dueAt)

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium tabular-nums",
          overdue
            ? "text-destructive"
            : isToday
              ? "text-primary font-semibold"
              : "text-foreground/90",
        )}
      >
        <CalendarIcon className="size-3.5 text-muted-foreground" />
        {formatDay(row.dueOn)}
      </span>
      {clock ? (
        <span className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary tabular-nums">
          <ClockIcon className="size-3" />
          {clock}
        </span>
      ) : null}
      {overdue ? (
        <Badge variant="destructive" className="text-[10px]">
          Zaległe
        </Badge>
      ) : isToday ? (
        <Badge variant="secondary" className="bg-secondary text-[10px] text-primary">
          Dzisiaj
        </Badge>
      ) : null}
    </div>
  )
}

function taskCountLabel(count: number) {
  if (count === 1) return "zadanie"
  const last = count % 10
  const teen = count % 100
  if (last >= 2 && last <= 4 && (teen < 12 || teen > 14)) return "zadania"
  return "zadań"
}
