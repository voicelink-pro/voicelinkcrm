import type { Metadata } from "next"

import { CalendarBoard } from "@/components/crm/calendar-board"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getWorkspaceGate } from "@/lib/auth/access"
import { firstSearchParam } from "@/lib/auth/return-to"
import { loadCalendarView } from "@/lib/crm/calendar-sync"
import { warsawToday } from "@/lib/crm/finance"

export const metadata: Metadata = {
  title: "Kalendarz",
}

function parseMonthParam(monthParam: string | null | undefined, todayKey: string): {
  year: number
  month: number
} {
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam?.trim() ?? "")
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    if (year >= 2020 && year <= 2100 && month >= 0 && month <= 11) {
      return { year, month }
    }
  }
  const [yStr, mStr] = todayKey.split("-")
  return {
    year: Number(yStr) || 2026,
    month: (Number(mStr) || 11) - 1,
  }
}

function parseDayParam(dayParam: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayParam?.trim() ?? "")
  return m ? m[0] : null
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const gate = await getWorkspaceGate()

  if (gate.kind !== "member") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Brak dostępu</AlertTitle>
        <AlertDescription>
          Kalendarz jest dostępny po zalogowaniu do obszaru roboczego.
        </AlertDescription>
      </Alert>
    )
  }

  const today = await warsawToday()
  const initialDayKey = parseDayParam(firstSearchParam(params.day))
  const monthHint = firstSearchParam(params.month) ?? initialDayKey?.slice(0, 7)
  const { year, month } = parseMonthParam(monthHint, today)

  // Zakres obejmujący pełną siatkę 6 tygodni wokół wybranego miesiąca
  const rangeStart = new Date(Date.UTC(year, month, -7, 0, 0, 0))
  const rangeEnd = new Date(Date.UTC(year, month + 1, 14, 23, 59, 59))
  const fromDay = rangeStart.toISOString().slice(0, 10)
  const toDay = rangeEnd.toISOString().slice(0, 10)

  const data = await loadCalendarView({
    workspaceId: gate.workspaceId,
    viewerId: gate.userId,
    fromIso: rangeStart.toISOString(),
    toIso: rangeEnd.toISOString(),
    fromDay,
    toDay,
  })

  return (
    <CalendarBoard
      viewerId={gate.userId}
      todayKey={today}
      initialYear={year}
      initialMonth={month}
      initialDayKey={initialDayKey}
      members={data.members}
      sources={data.sources}
      items={data.items}
      accounts={data.accounts}
    />
  )
}
