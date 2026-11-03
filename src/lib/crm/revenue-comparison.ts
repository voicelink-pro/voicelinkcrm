import { calendarDay } from "@/lib/crm/lead-query"
import type { ChartRow } from "@/lib/crm/dashboard"
import { chartMonthLabel } from "@/lib/crm/dashboard-query"
import { formatDay } from "@/lib/crm/format"

export type RevenueGranularity = "day" | "week" | "month"

export type RevenuePoint = {
  key: string
  from: string
  to: string
  shortLabel: string
  fullLabel: string
  totalCents: number
}

export type RevenueSeries = {
  currentCents: number
  currentLabel: string
  currentFrom: string
  currentTo: string
  points: RevenuePoint[]
}

export type RevenueComparisonData = Record<RevenueGranularity, RevenueSeries>

export type RevenueEntryAmount = {
  effectiveOn: string
  amountSignedCents: number
}

function parseIsoDay(isoDay: string) {
  const [year, month, day] = isoDay.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatIsoDay(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addCalendarDays(isoDay: string, offset: number) {
  const date = parseIsoDay(isoDay)
  date.setUTCDate(date.getUTCDate() + offset)
  return formatIsoDay(date)
}

export function startOfIsoWeek(isoDay: string) {
  const date = parseIsoDay(isoDay)
  const dayOfWeek = date.getUTCDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  date.setUTCDate(date.getUTCDate() + mondayOffset)
  return formatIsoDay(date)
}

function formatDayShort(isoDay: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(`${isoDay.slice(0, 10)}T12:00:00+01:00`))
}

function formatMonthShort(isoDay: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "short",
    timeZone: "Europe/Warsaw",
  })
    .format(new Date(`${isoDay.slice(0, 10)}T12:00:00+01:00`))
    .replace(/\.$/, "")
}

export function buildRevenueComparison(
  todayInput: string,
  monthChart: ChartRow[],
  entries: RevenueEntryAmount[],
): RevenueComparisonData {
  const today = calendarDay(todayInput) || "2026-11-01"

  // 1. Dzień: bieżący dzień (today) na tle ostatnich 7 dni kalendarzowych
  const dayPoints: RevenuePoint[] = []
  for (let offset = -6; offset <= 0; offset += 1) {
    const dayStr = addCalendarDays(today, offset)
    const totalCents = entries
      .filter((entry) => entry.effectiveOn === dayStr)
      .reduce((sum, entry) => sum + entry.amountSignedCents, 0)

    dayPoints.push({
      key: dayStr,
      from: dayStr,
      to: dayStr,
      shortLabel: formatDayShort(dayStr),
      fullLabel: formatDay(dayStr),
      totalCents,
    })
  }
  const currentDayPoint = dayPoints[dayPoints.length - 1]

  // 2. Tydzień: dany tydzień kalendarzowy (poniedziałek–niedziela) na tle 6 tygodni kalendarzowych
  const currentWeekMonday = startOfIsoWeek(today)
  const weekPoints: RevenuePoint[] = []
  for (let weekOffset = -5; weekOffset <= 0; weekOffset += 1) {
    const weekStart = addCalendarDays(currentWeekMonday, weekOffset * 7)
    const weekEnd = addCalendarDays(weekStart, 6)
    const totalCents = entries
      .filter((entry) => entry.effectiveOn >= weekStart && entry.effectiveOn <= weekEnd)
      .reduce((sum, entry) => sum + entry.amountSignedCents, 0)

    weekPoints.push({
      key: weekStart,
      from: weekStart,
      to: weekEnd,
      shortLabel: `${formatDayShort(weekStart)}–${formatDayShort(weekEnd)}`,
      fullLabel: `${formatDay(weekStart)} – ${formatDay(weekEnd)}`,
      totalCents,
    })
  }
  const currentWeekPoint = weekPoints[weekPoints.length - 1]

  // 3. Miesiąc: dany miesiąc kalendarzowy (np. 1–30 lis) na tle 6 miesięcy kalendarzowych
  const monthPoints: RevenuePoint[] = monthChart.map((row) => {
    const [year, month] = row.month.slice(0, 10).split("-").map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const monthFrom = `${year}-${String(month).padStart(2, "0")}-01`
    const monthTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    return {
      key: monthFrom,
      from: monthFrom,
      to: monthTo,
      shortLabel: formatMonthShort(monthFrom),
      fullLabel: chartMonthLabel(monthFrom),
      totalCents: row.totalCents,
    }
  })

  if (monthPoints.length === 0) {
    const [year, month] = today.split("-").map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const monthFrom = `${year}-${String(month).padStart(2, "0")}-01`
    const monthTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    monthPoints.push({
      key: monthFrom,
      from: monthFrom,
      to: monthTo,
      shortLabel: formatMonthShort(monthFrom),
      fullLabel: chartMonthLabel(monthFrom),
      totalCents: 0,
    })
  }
  const currentMonthPoint = monthPoints[monthPoints.length - 1]

  return {
    day: {
      currentCents: currentDayPoint.totalCents,
      currentLabel: `Dzisiaj (${currentDayPoint.fullLabel})`,
      currentFrom: currentDayPoint.from,
      currentTo: currentDayPoint.to,
      points: dayPoints,
    },
    week: {
      currentCents: currentWeekPoint.totalCents,
      currentLabel: `Ten tydzień (${currentWeekPoint.fullLabel})`,
      currentFrom: currentWeekPoint.from,
      currentTo: currentWeekPoint.to,
      points: weekPoints,
    },
    month: {
      currentCents: currentMonthPoint.totalCents,
      currentLabel: `Ten miesiąc (${currentMonthPoint.fullLabel})`,
      currentFrom: currentMonthPoint.from,
      currentTo: currentMonthPoint.to,
      points: monthPoints,
    },
  }
}
