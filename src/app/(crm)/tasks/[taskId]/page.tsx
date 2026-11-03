import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  TargetIcon,
  UserIcon,
} from "lucide-react"
import { cn } from "cn"

import { CompleteTaskForm, TaskEditor } from "@/components/crm/task-forms"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { warsawToday } from "@/lib/crm/finance"
import { formatDateTime, formatDay } from "@/lib/crm/format"
import { missing } from "@/lib/crm/labels"
import { listMembers } from "@/lib/crm/queries"
import { getTask, listTaskFormOptions } from "@/lib/crm/task-read"
import {
  taskIsOverdue,
  taskPriorityStyle,
  taskPriorityText,
  taskStatusStyle,
  taskStatusText,
} from "@/lib/crm/task-query"

export const metadata: Metadata = {
  title: "Zadanie",
}

function warsawClock(value: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const [record, today, members, options] = await Promise.all([
    getTask(taskId),
    warsawToday(),
    listMembers(),
    listTaskFormOptions(),
  ])

  if (record.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Karta niedostępna</AlertTitle>
        <AlertDescription>{record.error}</AlertDescription>
      </Alert>
    )
  }

  if (!record.task) {
    notFound()
  }

  const task = record.task
  const names = new Map(members.map((member) => [member.userId, member.fullName]))
  const overdue = taskIsOverdue(task.status, task.dueOn, today)
  const prioStyle = taskPriorityStyle(task.priority)
  const statStyle = taskStatusStyle(task.status)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/tasks" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Wróć do listy zadań
        </Button>
      </div>

      {/* Górna karta informacyjna zadania */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("gap-1.5", statStyle.badge)}>
                <span className={cn("size-1.5 shrink-0 rounded-full", statStyle.dot)} />
                {taskStatusText(task.status)}
              </Badge>
              <Badge variant="outline" className={cn("gap-1.5", prioStyle.badge)}>
                <span className={cn("size-1.5 shrink-0 rounded-full", prioStyle.dot)} />
                Priorytet: {taskPriorityText(task.priority)}
              </Badge>
              {task.kind === "follow_up" ? <Badge variant="secondary">Follow-up</Badge> : null}
              {overdue ? <Badge variant="destructive">Zaległe</Badge> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/70 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarIcon className="size-4 text-primary" />
            <span>
              Termin:{" "}
              <strong className="font-medium text-foreground">{formatDay(task.dueOn)}</strong>
              {task.dueAt ? (
                <span className="ml-1 inline-flex items-center gap-1 font-mono text-xs text-primary">
                  <ClockIcon className="size-3" />
                  {warsawClock(task.dueAt)}
                </span>
              ) : null}
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <UserIcon className="size-4 text-primary" />
            <span className="truncate">
              Przypisani:{" "}
              <strong className="font-medium text-foreground">
                {task.assigneeIds.length
                  ? task.assigneeIds.map((id) => names.get(id) ?? "Nie uzupełniono").join(", ")
                  : "Nie uzupełniono"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2Icon className="size-4 text-primary" />
            {task.accountId ? (
              <span>
                Klient:{" "}
                <Link
                  href={`/accounts/${task.accountId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {task.accountName ?? "Karta klienta"}
                </Link>
              </span>
            ) : (
              <span>Zadanie ogólne (bez klienta)</span>
            )}
          </div>
        </div>

        {task.dealId || task.originLabel ? (
          <div className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {task.dealId ? (
              <span className="inline-flex items-center gap-1.5">
                <TargetIcon className="size-3.5 text-primary" />
                Szansa:{" "}
                <Link
                  href={`/leads/${task.dealId}`}
                  className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {task.dealTitle ?? "Karta szansy"}
                </Link>
              </span>
            ) : null}
            {task.originLabel ? <span>Źródło: {task.originLabel}</span> : null}
          </div>
        ) : null}

        {task.status === "done" ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
            <span>
              Zadanie wykonane przez:{" "}
              <strong>{missing(names.get(task.completedBy ?? ""))}</strong> ({formatDateTime(task.completedAt)})
            </span>
          </div>
        ) : null}

        {task.description ? (
          <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm whitespace-pre-wrap text-foreground/90">
            {task.description}
          </div>
        ) : null}
      </div>

      {task.status !== "done" ? <CompleteTaskForm taskId={task.id} version={task.version} /> : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="border-b border-border/70 pb-3">
          <h2 className="text-base font-semibold">Edycja zadania</h2>
          <p className="text-xs text-muted-foreground">
            Zmień priorytet, status, termin lub przypisane osoby z zespołu.
          </p>
        </div>
        <TaskEditor
          key={`${task.id}:${task.version}`}
          taskId={task.id}
          version={task.version}
          title={task.title}
          description={task.description}
          dueOn={task.dueOn}
          dueTime={warsawClock(task.dueAt)}
          priority={task.priority}
          status={task.status}
          accountId={task.accountId}
          dealId={task.dealId}
          assigneeIds={task.assigneeIds}
          members={members}
          accounts={options.accounts}
          deals={options.deals}
        />
      </section>
    </div>
  )
}
