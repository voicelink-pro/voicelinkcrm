"use client"

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { changeStageAction } from "@/lib/crm/actions"
import { stageLabel } from "@/lib/crm/labels"
import { cn } from "cn"

const quickStatuses = [
  {
    code: "new",
    label: "Nowy",
    pill: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100/80",
    dot: "bg-red-500",
  },
  {
    code: "conversation_done",
    label: "Rozmowa",
    pill: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80",
    dot: "bg-amber-500",
  },
  {
    code: "meeting_scheduled",
    label: "Spotkanie",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80",
    dot: "bg-emerald-500",
  },
] as const

type QuickCode = (typeof quickStatuses)[number]["code"]

function quickStatus(stage: string) {
  if (stage === "new" || stage === "contact_attempt") return quickStatuses[0]
  if (stage === "conversation_done") return quickStatuses[1]
  if (stage === "meeting_scheduled" || stage === "meeting_done") return quickStatuses[2]
  return null
}

function isQuickCode(value: string): value is QuickCode {
  return quickStatuses.some((option) => option.code === value)
}

export function LeadStatusPill({
  dealId,
  version,
  stage,
  archived,
}: {
  dealId: string
  version: number
  stage: string
  archived: boolean
}) {
  const [shown, setShown] = useState(stage)
  const [currentVersion, setCurrentVersion] = useState(version)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = quickStatus(shown)
  const label = current?.label ?? stageLabel(shown)
  const locked = archived || shown === "won"

  async function choose(code: QuickCode) {
    if (pending || code === shown || code === current?.code) return
    const previous = shown
    setShown(code)
    setPending(true)
    setError(null)
    const formData = new FormData()
    formData.set("dealId", dealId)
    formData.set("version", String(currentVersion))
    formData.set("stage", code)
    const result = await changeStageAction({}, formData)
    setPending(false)
    if (result.error) {
      setShown(previous)
      setError(result.error)
      return
    }
    setCurrentVersion((value) => value + 1)
  }

  const pillTone =
    current?.pill ?? "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
  const dotTone = current?.dot ?? "bg-muted-foreground/50"

  if (locked) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap",
          shown === "won"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            shown === "won" ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
        />
        {label}
      </span>
    )
  }

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
            pillTone,
          )}
          disabled={pending}
          aria-label={`Status: ${label}. Wybierz inny.`}
          title={error ?? undefined}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", dotTone)} />
          <span>{label}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5 sm:w-36 sm:p-1">
          <DropdownMenuRadioGroup
            value={current?.code ?? ""}
            onValueChange={(value) => {
              if (typeof value === "string" && isQuickCode(value)) {
                void choose(value)
              }
            }}
          >
            {quickStatuses.map((option) => (
              <DropdownMenuRadioItem
                key={option.code}
                value={option.code}
                disabled={pending}
                className="min-h-12 gap-3 py-2.5 pr-9 pl-3 text-base sm:min-h-0 sm:gap-2 sm:py-1 sm:pr-8 sm:pl-1.5 sm:text-xs"
              >
                <span className={cn("size-3 shrink-0 rounded-full sm:size-2", option.dot)} />
                <span>{option.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span className="sr-only">{error}</span> : null}
    </div>
  )
}
