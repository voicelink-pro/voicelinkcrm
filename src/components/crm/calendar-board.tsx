"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloudDownloadIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MapPinIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  addGoogleCalendarSourceAction,
  createCalendarEventAction,
  deleteCalendarEventAction,
  removeCalendarSourceAction,
  syncCalendarNowAction,
  triggerAutoSyncAction,
  type CalendarActionState,
} from "@/lib/crm/calendar-actions"
import type {
  CalendarColor,
  CalendarSourceView,
  UnifiedCalendarItem,
} from "@/lib/crm/calendar-sync"

type Member = { userId: string; fullName: string; avatarUrl?: string | null }
type AccountOption = { id: string; displayName: string }

const colorThemes: Record<
  CalendarColor,
  {
    dot: string
    pill: string
    iconBox: string
    badge: string
    cardHover: string
    label: string
  }
> = {
  blue: {
    dot: "bg-blue-500",
    pill: "border-blue-200/80 bg-blue-50/90 text-blue-800 hover:bg-blue-100/80",
    iconBox: "border-blue-200/70 bg-blue-50 text-blue-600",
    badge: "border-blue-200/80 bg-blue-50/80 text-blue-700",
    cardHover: "hover:border-blue-300/80 hover:ring-blue-500/10",
    label: "Niebieski",
  },
  emerald: {
    dot: "bg-emerald-500",
    pill: "border-emerald-200/80 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100/80",
    iconBox: "border-emerald-200/70 bg-emerald-50 text-emerald-600",
    badge: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700",
    cardHover: "hover:border-emerald-300/80 hover:ring-emerald-500/10",
    label: "Szmaragdowy",
  },
  violet: {
    dot: "bg-violet-500",
    pill: "border-violet-200/80 bg-violet-50/90 text-violet-800 hover:bg-violet-100/80",
    iconBox: "border-violet-200/70 bg-violet-50 text-violet-600",
    badge: "border-violet-200/80 bg-violet-50/80 text-violet-700",
    cardHover: "hover:border-violet-300/80 hover:ring-violet-500/10",
    label: "Fioletowy",
  },
  amber: {
    dot: "bg-amber-500",
    pill: "border-amber-200/80 bg-amber-50/90 text-amber-800 hover:bg-amber-100/80",
    iconBox: "border-amber-200/70 bg-amber-50 text-amber-600",
    badge: "border-amber-200/80 bg-amber-50/80 text-amber-700",
    cardHover: "hover:border-amber-300/80 hover:ring-amber-500/10",
    label: "Bursztynowy",
  },
  rose: {
    dot: "bg-rose-500",
    pill: "border-rose-200/80 bg-rose-50/90 text-rose-800 hover:bg-rose-100/80",
    iconBox: "border-rose-200/70 bg-rose-50 text-rose-600",
    badge: "border-rose-200/80 bg-rose-50/80 text-rose-700",
    cardHover: "hover:border-rose-300/80 hover:ring-rose-500/10",
    label: "Różowy",
  },
}

const weekdayShort = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Ndz"]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

function formatFullDayTitle(dayKey: string) {
  const dt = new Date(`${dayKey}T12:00:00Z`)
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt)
}

function buildCalendarGrid(year: number, monthIndex: number): { dayKey: string; dayNumber: number; inCurrentMonth: boolean }[] {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1))
  const startDow = (firstDay.getUTCDay() + 6) % 7 // 0 = Poniedziałek, 6 = Niedziela
  const startDate = new Date(Date.UTC(year, monthIndex, 1 - startDow))

  const cells: { dayKey: string; dayNumber: number; inCurrentMonth: boolean }[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(startDate.getTime() + i * 86400_000)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    cells.push({
      dayKey: `${y}-${m}-${day}`,
      dayNumber: d.getUTCDate(),
      inCurrentMonth: d.getUTCMonth() === monthIndex,
    })
  }
  return cells
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const dt = new Date(`${dayKey}T12:00:00Z`)
  if (Number.isNaN(dt.getTime())) return dayKey
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

export function CalendarBoard({
  viewerId,
  todayKey,
  initialYear,
  initialMonth,
  initialDayKey,
  members,
  sources,
  items,
  accounts,
}: {
  viewerId: string
  todayKey: string
  initialYear: number
  initialMonth: number // 0-indexed (0 = styczeń)
  initialDayKey?: string | null
  members: Member[]
  sources: CalendarSourceView[]
  items: UnifiedCalendarItem[]
  accounts: AccountOption[]
}) {
  const router = useRouter()
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("all")
  const [selectedDayKey, setSelectedDayKey] = useState<string>(initialDayKey ?? todayKey)
  const [mobileDayViewOpen, setMobileDayViewOpen] = useState<boolean>(Boolean(initialDayKey))
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (initialDayKey) {
      setSelectedDayKey(initialDayKey)
      setMobileDayViewOpen(true)
    } else {
      setMobileDayViewOpen(false)
    }
  }, [initialDayKey, initialYear, initialMonth])

  // Automatyczna synchronizacja w tle co 10 minut (600 000 ms) podczas otwartego widoku
  useEffect(() => {
    const interval = setInterval(() => {
      void triggerAutoSyncAction().then(() => {
        router.refresh()
      })
    }, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [router])

  const cells = buildCalendarGrid(initialYear, initialMonth)
  const monthLabel = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(initialYear, initialMonth, 15)))

  const prevMonthDate = new Date(Date.UTC(initialYear, initialMonth - 1, 1))
  const nextMonthDate = new Date(Date.UTC(initialYear, initialMonth + 1, 1))
  const prevHref = `/calendar?month=${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`
  const nextHref = `/calendar?month=${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`

  const filteredItems = items.filter((item) => {
    if (selectedUserFilter === "all") return true
    if (selectedUserFilter === "me") return item.userId === viewerId
    return item.userId === selectedUserFilter
  })

  const itemsByDay = new Map<string, UnifiedCalendarItem[]>()
  for (const item of filteredItems) {
    const list = itemsByDay.get(item.dayKey) ?? []
    list.push(item)
    itemsByDay.set(item.dayKey, list)
  }

  const selectedDayItems = itemsByDay.get(selectedDayKey) ?? []

  async function handleManualSync() {
    setSyncing(true)
    const res = await syncCalendarNowAction()
    setSyncing(false)
    if (res.ok) {
      toast.success(res.message)
      router.refresh()
    } else {
      toast.error(res.message)
    }
  }

  async function handleDeleteLocalEvent(eventId: string) {
    const res = await deleteCalendarEventAction(eventId)
    if (res.ok) {
      toast.success("Usunięto wydarzenie.")
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      {/* Nagłówek na wysokości napisu Kalendarz + kompaktowy wybór kalendarza swojego lub użytkowników + przyciski akcji */}
      <div className={cn("flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3", mobileDayViewOpen && "max-xl:hidden")}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold sm:text-2xl">Kalendarz</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 sm:hidden">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sync 10m
              </span>
            </div>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Automatyczna synchronizacja z Google Calendar co 10 minut · dostęp dla całego zespołu
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:hidden">
            {sources.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={syncing}
                onClick={() => void handleManualSync()}
                aria-label="Synchronizuj kalendarze Google"
              >
                {syncing ? <Spinner /> : <RefreshCwIcon />}
              </Button>
            ) : null}

            <GoogleCalendarConnectDialog
              viewerId={viewerId}
              members={members}
              sources={sources}
              compactMobile
            />

            <NewCalendarEventDialog
              viewerId={viewerId}
              defaultDate={selectedDayKey}
              members={members}
              accounts={accounts}
              compactMobile
            />
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Przełącznik: Wszyscy / Mój kalendarz / Poszczególni użytkownicy */}
          <nav
            aria-label="Wybór kalendarza użytkownika"
            className="inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-2xs sm:w-auto"
          >
            <button
              type="button"
              onClick={() => setSelectedUserFilter("all")}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selectedUserFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <UsersIcon className="size-3.5" />
              <span>Wszyscy ({items.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedUserFilter("me")}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selectedUserFilter === "me"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <UserIcon className="size-3.5" />
              <span>Mój</span>
            </button>

            {members.map((member, idx) => {
              const active = selectedUserFilter === member.userId
              const paletteColors: CalendarColor[] = ["blue", "emerald", "violet", "amber", "rose"]
              const dotColor = colorThemes[paletteColors[idx % paletteColors.length] ?? "blue"].dot
              return (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() =>
                    setSelectedUserFilter(active ? "all" : member.userId)
                  }
                  title={`Kalendarz użytkownika: ${member.fullName}`}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? "border-primary/30 bg-secondary font-semibold text-primary shadow-2xs"
                      : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", dotColor)} />
                  <span>{member.fullName.split(" ")[0] || member.fullName}</span>
                </button>
              )
            })}
          </nav>

          <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
            {sources.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={syncing}
                onClick={() => void handleManualSync()}
                title="Synchronizuj wszystkie podłączone kalendarze Google teraz"
              >
                {syncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                Synchronizuj
              </Button>
            ) : null}

            <GoogleCalendarConnectDialog
              viewerId={viewerId}
              members={members}
              sources={sources}
            />

            <NewCalendarEventDialog
              viewerId={viewerId}
              defaultDate={selectedDayKey}
              members={members}
              accounts={accounts}
            />
          </div>
        </div>
      </div>

      {/* Pasek statusu podłączonych kalendarzy Google (desktop/tablet lub gdy podłączono źródła) */}
      <div
        className={cn(
          "hidden flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-4 py-2.5 text-xs shadow-2xs sm:flex",
          mobileDayViewOpen && "max-xl:hidden",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Auto-sync co 10 min aktywny
          </span>
          <span className="hidden text-muted-foreground sm:inline">|</span>
          {sources.length === 0 ? (
            <span className="hidden text-muted-foreground sm:inline">
              Nie zaimportowano jeszcze zewnętrznego kalendarza Google. Kliknij „Importuj Google Calendar”, aby połączyć swój kalendarz lub kalendarz członka zespołu.
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {sources.map((src) => {
                const theme = colorThemes[src.color] ?? colorThemes.blue
                return (
                  <span
                    key={src.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      theme.pill,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", theme.dot)} />
                    <span>
                      {src.label} ({src.userName})
                    </span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Główny układ: na mobile cały miesięczny kalendarz ALBO pełnoekranowy widok wybranego dnia; na desktopie obok siebie */}
      <div className="grid gap-5 xl:grid-cols-[1fr_23rem]">
        {/* Siatka miesiąca */}
        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xs",
            mobileDayViewOpen && "max-xl:hidden",
          )}
        >
          {/* Pasek nawigacji miesiąca */}
          <div className="flex items-center justify-between border-b border-border px-3.5 py-3 sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-primary sm:size-5" />
              <h2 className="text-base font-semibold capitalize tracking-tight text-foreground sm:text-lg">
                {monthLabel}
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDayKey(todayKey)
                  setMobileDayViewOpen(false)
                }}
                nativeButton={false}
                render={<Link href="/calendar" />}
              >
                Dzisiaj
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Poprzedni miesiąc"
                nativeButton={false}
                render={<Link href={prevHref} />}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Następny miesiąc"
                nativeButton={false}
                render={<Link href={nextHref} />}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>

          {/* Nagłówki dni tygodnia */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/35">
            {weekdayShort.map((dayName) => (
              <div
                key={dayName}
                className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Komórki dni 6x7 — na mobile czyste, równe kafelki całego miesiąca */}
          <div className="grid grid-cols-7 divide-x divide-y divide-border">
            {cells.map((cell) => {
              const dayEvents = itemsByDay.get(cell.dayKey) ?? []
              const isToday = cell.dayKey === todayKey
              const isSelected = cell.dayKey === selectedDayKey

              return (
                <button
                  key={cell.dayKey}
                  type="button"
                  onClick={() => {
                    setSelectedDayKey(cell.dayKey)
                    setMobileDayViewOpen(true)
                  }}
                  className={cn(
                    "group flex min-h-14 flex-col items-center justify-between gap-1 p-1.5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-28 sm:items-stretch sm:justify-start sm:gap-1.5 sm:p-2 sm:text-left",
                    !cell.inCurrentMonth && "bg-muted/20 text-muted-foreground/60",
                    isSelected
                      ? "bg-primary/5 ring-2 ring-inset ring-primary/40"
                      : "hover:bg-muted/40 active:bg-muted/60",
                  )}
                >
                  <div className="flex w-full items-center justify-center sm:justify-between">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-6",
                        isToday
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : isSelected
                            ? "bg-secondary text-primary"
                            : cell.inCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                      )}
                    >
                      {cell.dayNumber}
                    </span>

                    {dayEvents.length > 0 ? (
                      <span className="hidden text-[10px] font-medium text-muted-foreground tabular-nums sm:inline">
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  {/* Mobile: czysty, estetyczny widok całego miesiąca z kolorowymi kropkami i licznikiem */}
                  {dayEvents.length > 0 ? (
                    <div className="flex items-center justify-center gap-1 sm:hidden">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const theme = colorThemes[ev.color] ?? colorThemes.blue
                        return (
                          <span
                            key={ev.id}
                            className={cn("size-1.5 rounded-full", theme.dot)}
                          />
                        )
                      })}
                      {dayEvents.length > 3 ? (
                        <span className="text-[9px] leading-none font-semibold text-muted-foreground tabular-nums">
                          +{dayEvents.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="h-1.5 sm:hidden" aria-hidden="true" />
                  )}

                  {/* Desktop / tablet: czytelne paski wydarzeń w stylu shadcn */}
                  <div className="hidden flex-col gap-1 overflow-hidden sm:flex">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const theme = colorThemes[ev.color] ?? colorThemes.blue
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center gap-1.5 truncate rounded-md border border-border/80 bg-background/95 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-foreground shadow-2xs transition-colors group-hover:border-border"
                        >
                          <span className={cn("size-1.5 shrink-0 rounded-full", theme.dot)} />
                          {!ev.allDay ? (
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                              {formatTime(ev.startsAt)}
                            </span>
                          ) : null}
                          <span className="truncate">{ev.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 ? (
                      <span className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{dayEvents.length - 3} więcej
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-3.5 py-2 text-[11px] text-muted-foreground xl:hidden">
            <span>Dotknij dowolny dzień, aby otworzyć pełny plan dnia</span>
            <button
              type="button"
              onClick={() => setMobileDayViewOpen(true)}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Otwórz wybrany dzień →
            </button>
          </div>
        </div>

        {/* Widok wybranego dnia: na mobile otwiera się na całej stronie po kliknięciu dnia; na desktopie stały panel boczny */}
        <aside
          className={cn(
            "flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-2xs sm:p-5",
            !mobileDayViewOpen && "max-xl:hidden",
          )}
        >
          <div className="flex flex-col gap-4">
            {/* Pasek nawigacji widoku dnia na mobile / tablet */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3 xl:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobileDayViewOpen(false)}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Cały miesiąc
              </Button>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Poprzedni dzień"
                  onClick={() => setSelectedDayKey((prev) => shiftDayKey(prev, -1))}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDayKey(todayKey)}
                >
                  Dzisiaj
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Następny dzień"
                  onClick={() => setSelectedDayKey((prev) => shiftDayKey(prev, 1))}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
              <div className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <LayoutGridIcon className="size-3.5 xl:hidden" />
                  Plan dnia
                </span>
                <h3 className="text-lg font-semibold capitalize text-foreground sm:text-base">
                  {formatFullDayTitle(selectedDayKey)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="tabular-nums">
                  {selectedDayItems.length}{" "}
                  {selectedDayItems.length === 1 ? "wpis" : "wpisów"}
                </Badge>
              </div>
            </div>

            {/* Szybkie dodawanie wydarzenia w widoku dnia na mobile */}
            <div className="flex flex-wrap items-center justify-between gap-2 xl:hidden">
              <span className="text-xs text-muted-foreground">
                Wydarzenia, spotkania Fathom i zadania na wybrany dzień
              </span>
              <NewCalendarEventDialog
                viewerId={viewerId}
                defaultDate={selectedDayKey}
                members={members}
                accounts={accounts}
              />
            </div>

            {selectedDayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
                <CalendarIcon className="size-7 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">
                  Brak wydarzeń w tym dniu
                </p>
                <p className="text-xs text-muted-foreground">
                  Wybierz inny dzień na siatce kalendarza, dodaj nowe wydarzenie lub zaimportuj swój kalendarz Google.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {selectedDayItems.map((item) => {
                  const theme = colorThemes[item.color] ?? colorThemes.blue
                  const ItemIcon =
                    item.kind === "meeting"
                      ? VideoIcon
                      : item.kind === "task"
                        ? ListChecksIcon
                        : CalendarIcon

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "group flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs ring-1 ring-transparent transition-all hover:bg-muted/20",
                        theme.cardHover,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div
                            className={cn(
                              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                              theme.iconBox,
                            )}
                          >
                            <ItemIcon className="size-4" />
                          </div>

                          <div className="flex min-w-0 flex-col gap-0.5">
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="truncate text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                              >
                                {item.title}
                              </Link>
                            ) : (
                              <span className="truncate text-sm font-semibold text-foreground">
                                {item.title}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                              <ClockIcon className="size-3 shrink-0" />
                              {item.allDay
                                ? "Cały dzień"
                                : `${formatTime(item.startsAt)} – ${formatTime(item.endsAt)}`}
                            </span>
                          </div>
                        </div>

                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                            theme.badge,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", theme.dot)} />
                          <span>{item.sourceLabel}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="size-4">
                            {item.userAvatarUrl ? (
                              <AvatarImage
                                src={item.userAvatarUrl}
                                alt={item.userName}
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-secondary text-[9px] font-semibold text-primary">
                              {initials(item.userName)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{item.userName}</span>
                        </div>

                        {item.accountName ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <Building2Icon className="size-3" />
                            {item.accountName}
                          </span>
                        ) : null}
                      </div>

                      {item.location ? (
                        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPinIcon className="size-3 shrink-0" />
                          <span className="truncate">{item.location}</span>
                        </p>
                      ) : null}

                      {item.description ? (
                        <p className="line-clamp-3 rounded-lg bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap">
                          {item.description}
                        </p>
                      ) : null}

                      {item.meetingUrl || item.kind === "local" ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                          {item.meetingUrl ? (
                            <Button
                              variant="outline"
                              size="xs"
                              nativeButton={false}
                              render={
                                <a
                                  href={item.meetingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                />
                              }
                            >
                              <VideoIcon data-icon="inline-start" />
                              Dołącz / Otwórz link
                              <ExternalLinkIcon data-icon="inline-end" />
                            </Button>
                          ) : (
                            <span />
                          )}

                          {item.kind === "local" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => void handleDeleteLocalEvent(item.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon data-icon="inline-start" />
                              Usuń
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
            Każdy członek zespołu widzi swój kalendarz oraz kalendarze pozostałych użytkowników, aby łatwo umawiać spotkania bez nakładania terminów.
          </div>
        </aside>
      </div>
    </div>
  )
}

function GoogleCalendarConnectDialog({
  viewerId,
  members,
  sources,
  compactMobile = false,
}: {
  viewerId: string
  members: Member[]
  sources: CalendarSourceView[]
  compactMobile?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState<CalendarColor>("blue")
  const [state, action, pending] = useActionState(addGoogleCalendarSourceAction, {} as CalendarActionState)

  async function handleRemove(id: string) {
    const res = await removeCalendarSourceAction(id)
    if (res.ok) {
      toast.success("Odłączono kalendarz.")
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          compactMobile ? (
            <Button variant="outline" size="sm" />
          ) : (
            <Button variant="outline" />
          )
        }
      >
        <CloudDownloadIcon data-icon="inline-start" />
        {compactMobile ? "Google" : "Importuj Google Calendar"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import i synchronizacja Google Calendar</DialogTitle>
          <DialogDescription>
            Podłącz swój kalendarz Google (lub kalendarz innego członka zespołu). CRM będzie automatycznie synchronizować wydarzenia co 10 minut.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="color" value={color} />

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="gcal-user">Właściciel kalendarza (Użytkownik)</FieldLabel>
              <select
                id="gcal-user"
                name="userId"
                defaultValue={viewerId}
                className={controlClassName}
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName} {m.userId === viewerId ? "(Mój kalendarz)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="gcal-label">Nazwa kalendarza</FieldLabel>
              <Input
                id="gcal-label"
                name="label"
                defaultValue="Google Calendar"
                placeholder="Np. Spotkania handlowe, Kalendarz główny..."
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="gcal-url">Adres URL kalendarza w formacie iCal (.ics)</FieldLabel>
              <Input
                id="gcal-url"
                name="icalUrl"
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                required
              />
              <FieldDescription className="text-xs">
                W Google Calendar wejdź w: <strong>Ustawienia i udostępnianie → Integrowanie kalendarza → Tajny adres w formacie iCal</strong> (lub publiczny adres iCal) i wklej go powyżej.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Kolor oznaczenia w kalendarzu zespołu</FieldLabel>
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Kolor kalendarza">
                {(Object.keys(colorThemes) as CalendarColor[]).map((cKey) => {
                  const theme = colorThemes[cKey]
                  const selected = color === cKey
                  return (
                    <button
                      key={cKey}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setColor(cKey)}
                      className={cn(
                        "flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-all",
                        selected
                          ? cn(theme.pill, "ring-2 ring-current/20")
                          : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", theme.dot)} />
                      <span className="truncate">{theme.label}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
          </FieldGroup>

          {state.error ? (
            <p className="text-xs font-medium text-destructive">{state.error}</p>
          ) : null}
          {state.notice ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
              <span>{state.notice}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Zamknij
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Importowanie...
                </>
              ) : (
                <>
                  <CloudDownloadIcon data-icon="inline-start" />
                  Połącz i zsynchronizuj
                </>
              )}
            </Button>
          </DialogFooter>
        </form>

        {sources.length > 0 ? (
          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Podłączone kalendarze Google ({sources.length})
            </span>
            <ul className="flex flex-col gap-2">
              {sources.map((src) => {
                const theme = colorThemes[src.color] ?? colorThemes.blue
                return (
                  <li
                    key={src.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-2 shrink-0 rounded-full", theme.dot)} />
                        <span className="font-semibold text-foreground">{src.label}</span>
                        <span className="text-muted-foreground">· {src.userName}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Auto-sync co {src.syncIntervalMinutes} min
                        {src.lastError ? ` · Błąd: ${src.lastError}` : ""}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Odłącz kalendarz ${src.label}`}
                      onClick={() => void handleRemove(src.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function NewCalendarEventDialog({
  viewerId,
  defaultDate,
  members,
  accounts,
  compactMobile = false,
}: {
  viewerId: string
  defaultDate: string
  members: Member[]
  accounts: AccountOption[]
  compactMobile?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createCalendarEventAction, {} as CalendarActionState)

  useEffect(() => {
    if (state.savedAt) {
      setOpen(false)
      toast.success(state.notice ?? "Dodano wydarzenie.")
    }
  }, [state.savedAt, state.notice])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={compactMobile ? <Button size="sm" /> : <Button />}>
        <PlusIcon data-icon="inline-start" />
        {compactMobile ? "Dodaj" : "Dodaj wydarzenie"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nowe wydarzenie w kalendarzu</DialogTitle>
          <DialogDescription>
            Zaplanuj spotkanie lub wydarzenie widoczne w kalendarzu wybranego użytkownika oraz zespołu.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          <FieldGroup className="gap-3.5">
            <Field>
              <FieldLabel htmlFor="ev-title">Tytuł wydarzenia</FieldLabel>
              <Input
                id="ev-title"
                name="title"
                required
                placeholder="Np. Prezentacja VoiceLink, Rozmowa wdrożeniowa..."
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ev-user">Kalendarz użytkownika</FieldLabel>
              <select
                id="ev-user"
                name="userId"
                defaultValue={viewerId}
                className={controlClassName}
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field>
                <FieldLabel htmlFor="ev-date">Data</FieldLabel>
                <Input
                  id="ev-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={defaultDate}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ev-start">Od</FieldLabel>
                <Input id="ev-start" name="startTime" type="time" defaultValue="10:00" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ev-end">Do</FieldLabel>
                <Input id="ev-end" name="endTime" type="time" defaultValue="11:00" />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="ev-account">Klient (opcjonalnie)</FieldLabel>
              <select id="ev-account" name="accountId" defaultValue="" className={controlClassName}>
                <option value="">Bez klienta</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="ev-url">Link do spotkania (Google Meet / Zoom)</FieldLabel>
              <Input
                id="ev-url"
                name="meetingUrl"
                placeholder="https://meet.google.com/..."
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ev-desc">Notatka</FieldLabel>
              <textarea
                id="ev-desc"
                name="description"
                className={cn(textAreaClassName, "min-h-20")}
                placeholder="Agenda lub szczegóły rozmowy..."
              />
            </Field>
          </FieldGroup>

          {state.error ? (
            <p className="text-xs font-medium text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Zapisywanie...
                </>
              ) : (
                <>
                  <CalendarPlusIcon data-icon="inline-start" />
                  Zapisz w kalendarzu
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
