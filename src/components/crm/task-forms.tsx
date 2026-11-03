"use client"

import { useActionState, useEffect, useState } from "react"
import { CheckCircle2Icon, CheckIcon } from "lucide-react"
import { cn } from "cn"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { completeTaskAction, saveTaskAction } from "@/lib/crm/task-actions"
import {
  taskPriorityOptions,
  taskPriorityStyle,
  taskStatusOptions,
  taskStatusStyle,
} from "@/lib/crm/task-query"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

function PendingLabel({ pending, children }: { pending: boolean; children: string }) {
  return pending ? (
    <>
      <Spinner data-icon="inline-start" />
      Zapisuję...
    </>
  ) : (
    children
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

export type TaskMemberOption = {
  userId: string
  fullName: string
  avatarUrl?: string | null
}
export type TaskAccountOption = { id: string; displayName: string }
export type TaskDealOption = { id: string; title: string; accountId: string }

export function TaskEditor({
  taskId,
  version,
  title,
  description,
  dueOn,
  dueTime,
  priority: initialPriority,
  status: initialStatus,
  accountId,
  dealId,
  assigneeIds,
  members,
  accounts,
  deals,
  onSuccess,
}: {
  taskId?: string
  version?: number
  title?: string
  description?: string | null
  dueOn?: string | null
  dueTime?: string
  priority?: string
  status?: string
  accountId?: string | null
  dealId?: string | null
  assigneeIds: string[]
  members: TaskMemberOption[]
  accounts: TaskAccountOption[]
  deals: TaskDealOption[]
  onSuccess?: () => void
}) {
  const [state, action, pending] = useActionState(saveTaskAction, initialState)
  const [priority, setPriority] = useState(initialPriority ?? "normal")
  const [status, setStatus] = useState(initialStatus ?? "todo")
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(assigneeIds)
  const [account, setAccount] = useState(accountId ?? "")
  const [deal, setDeal] = useState(dealId ?? "")

  useEffect(() => {
    if (state.savedAt && onSuccess) {
      onSuccess()
    }
  }, [state.savedAt, onSuccess])

  const visibleDeals = deals.filter((item) => item.accountId === account)

  function toggleAssignee(userId: string) {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-4"
    >
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : null}
      {version ? <input type="hidden" name="version" value={version} /> : null}
      {onSuccess ? <input type="hidden" name="noRedirect" value="1" /> : null}
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="status" value={status} />
      {selectedAssignees.map((id) => (
        <input key={id} type="hidden" name="assigneeIds" value={id} />
      ))}

      <FormFeedback state={state} />

      <FieldGroup className="gap-4">
        <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
          <FieldLabel htmlFor="task-title">Tytuł zadania</FieldLabel>
          <Input
            id="task-title"
            name="title"
            required
            maxLength={200}
            defaultValue={title ?? ""}
            placeholder="Np. Zadzwonić w sprawie oferty, przygotować klucze API..."
          />
          {state.fieldErrors?.title ? <FieldError>{state.fieldErrors.title}</FieldError> : null}
        </Field>

        {/* Wizualny wybór priorytetu */}
        <Field>
          <FieldLabel>Priorytet</FieldLabel>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Priorytet zadania">
            {taskPriorityOptions.map(([code, label]) => {
              const style = taskPriorityStyle(code)
              const selected = priority === code
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPriority(code)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? cn(style.badge, "ring-2 ring-current/15 shadow-2xs")
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </Field>

        {/* Wizualny wybór statusu */}
        <Field>
          <FieldLabel>Status</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Status zadania">
            {taskStatusOptions.map(([code, label]) => {
              const style = taskStatusStyle(code)
              const selected = status === code
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatus(code)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? cn(style.badge, "ring-2 ring-current/15 shadow-2xs")
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </Field>

        {/* Wizualne przypisanie do użytkowników */}
        <Field data-invalid={state.fieldErrors?.assigneeIds ? true : undefined}>
          <FieldLabel>Przypisani użytkownicy</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => {
              const active = selectedAssignees.includes(member.userId)
              return (
                <button
                  key={member.userId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleAssignee(member.userId)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary ring-2 ring-primary/15 shadow-2xs"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Avatar className="size-5">
                    {member.avatarUrl ? (
                      <AvatarImage
                        src={member.avatarUrl}
                        alt={member.fullName}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold text-primary">
                      {initials(member.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.fullName}</span>
                  {active ? <CheckIcon className="size-3.5 text-primary" /> : null}
                </button>
              )
            })}
          </div>
          {state.fieldErrors?.assigneeIds ? (
            <FieldError>{state.fieldErrors.assigneeIds}</FieldError>
          ) : (
            <FieldDescription className="text-xs">
              Jedno zadanie dla wszystkich zaznaczonych osób. Ukończenie zamyka je dla każdej z nich.
            </FieldDescription>
          )}
        </Field>

        {/* Termin i godzina */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={state.fieldErrors?.dueOn ? true : undefined}>
            <FieldLabel htmlFor="termin">Termin wykonania</FieldLabel>
            <Input id="termin" name="dueOn" type="date" defaultValue={dueOn ?? ""} />
            {state.fieldErrors?.dueOn ? <FieldError>{state.fieldErrors.dueOn}</FieldError> : null}
          </Field>
          <Field data-invalid={state.fieldErrors?.dueTime ? true : undefined}>
            <FieldLabel htmlFor="task-time">Godzina (opcjonalnie)</FieldLabel>
            <Input id="task-time" name="dueTime" type="time" defaultValue={dueTime ?? ""} />
            {state.fieldErrors?.dueTime ? <FieldError>{state.fieldErrors.dueTime}</FieldError> : null}
          </Field>
        </div>

        {/* Opis / notatka do zadania */}
        <Field>
          <FieldLabel htmlFor="task-description">Opis i szczegóły</FieldLabel>
          <textarea
            id="task-description"
            name="description"
            placeholder="Dodatkowy kontekst, numer telefonu lub lista punktów do omówienia..."
            className={cn(textAreaClassName, "min-h-20")}
            defaultValue={description ?? ""}
          />
        </Field>

        {/* Powiązania: Klient / Szansa */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="task-account">Klient</FieldLabel>
            <select
              id="task-account"
              name="accountId"
              className={controlClassName}
              value={account}
              onChange={(event) => {
                setAccount(event.target.value)
                setDeal("")
              }}
            >
              <option value="">Bez klienta</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="task-deal">Szansa</FieldLabel>
            <select
              id="task-deal"
              name="dealId"
              className={controlClassName}
              value={deal}
              disabled={!account}
              onChange={(event) => setDeal(event.target.value)}
            >
              <option value="">Bez szansy</option>
              {visibleDeals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FieldGroup>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending}>
          <PendingLabel pending={pending}>{taskId ? "Zapisz zmiany" : "Utwórz zadanie"}</PendingLabel>
        </Button>
      </div>
    </ActionForm>
  )
}

export function CompleteTaskForm({ taskId, version }: { taskId: string; version: number }) {
  const [state, action, pending] = useActionState(completeTaskAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="version" value={version} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">Gotowe do zamknięcia?</span>
        <span className="text-xs text-muted-foreground">
          Ukończenie zamyka to zadanie dla wszystkich przypisanych osób i zapisuje autora wykonania.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <FormFeedback state={state} />
        <Button type="submit" disabled={pending}>
          <CheckCircle2Icon data-icon="inline-start" />
          <PendingLabel pending={pending}>Oznacz jako ukończone</PendingLabel>
        </Button>
      </div>
    </ActionForm>
  )
}
