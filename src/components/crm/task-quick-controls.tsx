"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  PlusIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import {
  TaskEditor,
  type TaskAccountOption,
  type TaskDealOption,
  type TaskMemberOption,
} from "@/components/crm/task-forms"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { completeTaskAction, quickUpdateTaskAction } from "@/lib/crm/task-actions"
import {
  taskPriorityOptions,
  taskPriorityStyle,
  taskPriorityText,
  taskStatusOptions,
  taskStatusStyle,
  taskStatusText,
} from "@/lib/crm/task-query"

export type InteractiveTaskData = {
  id: string
  title: string
  description: string | null
  dueOn: string | null
  dueAt: string | null
  status: string
  priority: string
  accountId: string | null
  dealId: string | null
  version: number
  assigneeIds: string[]
}

function warsawClock(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

export function TaskCompleteButton({ task }: { task: InteractiveTaskData }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const done = task.status === "done"

  async function toggleDone() {
    if (pending || done) return
    setPending(true)
    const formData = new FormData()
    formData.set("taskId", task.id)
    formData.set("version", String(task.version))
    const res = await completeTaskAction({}, formData)
    setPending(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Zadanie oznaczone jako ukończone.")
    router.refresh()
  }

  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() => void toggleDone()}
      title={done ? "Zadanie ukończone" : "Oznacz zadanie jako ukończone"}
      aria-label={done ? "Zadanie ukończone" : `Oznacz jako ukończone: ${task.title}`}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        done
          ? "text-emerald-600"
          : "text-muted-foreground/60 hover:bg-emerald-50 hover:text-emerald-600",
        pending && "opacity-50",
      )}
    >
      {done ? <CheckCircle2Icon className="size-5" /> : <CircleIcon className="size-5" />}
    </button>
  )
}

export function TaskPriorityPill({ task }: { task: InteractiveTaskData }) {
  const router = useRouter()
  const [shown, setShown] = useState(task.priority)
  const [version, setVersion] = useState(task.version)
  const [pending, setPending] = useState(false)
  const style = taskPriorityStyle(shown)

  async function selectPriority(nextPriority: string) {
    if (pending || nextPriority === shown) return
    const previous = shown
    setShown(nextPriority)
    setPending(true)

    const result = await quickUpdateTaskAction({
      taskId: task.id,
      version,
      title: task.title,
      description: task.description,
      dueOn: task.dueOn,
      dueTime: warsawClock(task.dueAt),
      priority: nextPriority,
      status: task.status,
      accountId: task.accountId,
      dealId: task.dealId,
      assigneeIds: task.assigneeIds,
    })

    setPending(false)
    if (!result.ok) {
      setShown(previous)
      toast.error(result.error ?? "Nie udało się zmienić priorytetu.")
      return
    }
    setVersion((v) => v + 1)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={`Priorytet: ${taskPriorityText(shown)}. Kliknij, aby zmienić.`}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
          style.badge,
        )}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
        <span>{taskPriorityText(shown)}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ustaw priorytet</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={shown}
            onValueChange={(val) => {
              if (typeof val === "string") void selectPriority(val)
            }}
          >
            {taskPriorityOptions.map(([code, label]) => {
              const itemStyle = taskPriorityStyle(code)
              return (
                <DropdownMenuRadioItem key={code} value={code} disabled={pending}>
                  <span className={cn("size-2 shrink-0 rounded-full", itemStyle.dot)} />
                  <span>{label}</span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskStatusPill({ task }: { task: InteractiveTaskData }) {
  const router = useRouter()
  const [shown, setShown] = useState(task.status)
  const [version, setVersion] = useState(task.version)
  const [pending, setPending] = useState(false)
  const style = taskStatusStyle(shown)

  async function selectStatus(nextStatus: string) {
    if (pending || nextStatus === shown) return
    const previous = shown
    setShown(nextStatus)
    setPending(true)

    const result = await quickUpdateTaskAction({
      taskId: task.id,
      version,
      title: task.title,
      description: task.description,
      dueOn: task.dueOn,
      dueTime: warsawClock(task.dueAt),
      priority: task.priority,
      status: nextStatus,
      accountId: task.accountId,
      dealId: task.dealId,
      assigneeIds: task.assigneeIds,
    })

    setPending(false)
    if (!result.ok) {
      setShown(previous)
      toast.error(result.error ?? "Nie udało się zmienić statusu.")
      return
    }
    setVersion((v) => v + 1)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={`Status: ${taskStatusText(shown)}. Kliknij, aby zmienić.`}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
          style.badge,
        )}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
        <span>{taskStatusText(shown)}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Zmień status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={shown}
            onValueChange={(val) => {
              if (typeof val === "string") void selectStatus(val)
            }}
          >
            {taskStatusOptions.map(([code, label]) => {
              const itemStyle = taskStatusStyle(code)
              return (
                <DropdownMenuRadioItem key={code} value={code} disabled={pending}>
                  <span className={cn("size-2 shrink-0 rounded-full", itemStyle.dot)} />
                  <span>{label}</span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskAssigneePill({
  task,
  members,
}: {
  task: InteractiveTaskData
  members: TaskMemberOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(task.assigneeIds)
  const [version, setVersion] = useState(task.version)
  const [pending, setPending] = useState(false)
  const names = new Map(members.map((m) => [m.userId, m.fullName]))
  const avatars = new Map(members.map((m) => [m.userId, m.avatarUrl ?? null]))

  async function toggleAssignee(userId: string) {
    if (pending) return
    const exists = selected.includes(userId)
    const next = exists ? selected.filter((id) => id !== userId) : [...selected, userId]
    if (next.length === 0) {
      toast.error("Zadanie musi mieć przypisaną co najmniej jedną osobę.")
      return
    }

    const previous = selected
    setSelected(next)
    setPending(true)

    const result = await quickUpdateTaskAction({
      taskId: task.id,
      version,
      title: task.title,
      description: task.description,
      dueOn: task.dueOn,
      dueTime: warsawClock(task.dueAt),
      priority: task.priority,
      status: task.status,
      accountId: task.accountId,
      dealId: task.dealId,
      assigneeIds: next,
    })

    setPending(false)
    if (!result.ok) {
      setSelected(previous)
      toast.error(result.error ?? "Nie udało się zmienić przypisania.")
      return
    }
    setVersion((v) => v + 1)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label="Przypisane osoby. Kliknij, aby zmienić."
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <div className="flex -space-x-1.5">
          {selected.slice(0, 3).map((id) => {
            const fullName = names.get(id) ?? "Użytkownik"
            const avatarUrl = avatars.get(id)
            return (
              <Avatar key={id} className="size-5 ring-2 ring-background">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={fullName} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-secondary text-[10px] font-semibold text-primary">
                  {initials(fullName)}
                </AvatarFallback>
              </Avatar>
            )
          })}
        </div>
        <span className="max-w-36 truncate">
          {selected.map((id) => names.get(id) ?? "Nie uzupełniono").join(", ")}
        </span>
        <UserPlusIcon className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Przypisz do użytkowników</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {members.map((member) => {
            const checked = selected.includes(member.userId)
            return (
              <DropdownMenuCheckboxItem
                key={member.userId}
                checked={checked}
                disabled={pending}
                onCheckedChange={() => void toggleAssignee(member.userId)}
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
                <span className="truncate">{member.fullName}</span>
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewTaskDialog({
  currentUserId,
  members,
  accounts,
  deals,
}: {
  currentUserId: string
  members: TaskMemberOption[]
  accounts: TaskAccountOption[]
  deals: TaskDealOption[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Nowe zadanie
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowe zadanie</DialogTitle>
          <DialogDescription>
            Ustaw priorytet, termin, przypisz osoby z zespołu i opcjonalnie powiąż zadanie z klientem.
          </DialogDescription>
        </DialogHeader>
        <TaskEditor
          assigneeIds={currentUserId ? [currentUserId] : []}
          members={members}
          accounts={accounts}
          deals={deals}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
