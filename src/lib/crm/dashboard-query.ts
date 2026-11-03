import { firstSearchParam } from "@/lib/auth/return-to"
import { calendarDay } from "@/lib/crm/lead-query"

const userPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DashboardQuery = {
  from: string
  to: string
  owner: string
  source: string
}

type RawParams = Record<string, string | string[] | undefined>

export function monthBounds(today: string) {
  const day = calendarDay(today)
  if (!day) {
    return null
  }

  const [year, month] = day.split("-").map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  }
}

export function previousMonthBounds(dayInput: string) {
  const day = calendarDay(dayInput)
  if (!day) {
    return null
  }

  const [year, month] = day.split("-").map(Number)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const last = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
  return {
    from: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
    to: `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  }
}

export function parseDashboardQuery(params: RawParams, today: string): DashboardQuery {
  const bounds = monthBounds(today)
  const owner = (firstSearchParam(params.owner) ?? "").trim()

  return {
    from: calendarDay(firstSearchParam(params.from)) || bounds?.from || today,
    to: calendarDay(firstSearchParam(params.to)) || bounds?.to || today,
    owner: userPattern.test(owner) ? owner : "",
    source: (firstSearchParam(params.source) ?? "").trim().slice(0, 80),
  }
}

export function conversionText(won: number, lost: number) {
  const closed = won + lost
  if (closed === 0) {
    return "Brak danych"
  }

  return `${won} z ${closed}`
}

export type ConversionComparison = {
  currentWon: number
  currentLost: number
  currentClosed: number
  currentRate: number | null
  previousWon: number
  previousLost: number
  previousClosed: number
  previousRate: number | null
  deltaPoints: number | null
  previousMonthLabel: string
}

export function buildConversionComparison(
  currentWon: number,
  currentLost: number,
  previousWon: number,
  previousLost: number,
  previousMonthFrom: string,
): ConversionComparison {
  const currentClosed = currentWon + currentLost
  const previousClosed = previousWon + previousLost
  const currentRate = currentClosed > 0 ? (currentWon / currentClosed) * 100 : null
  const previousRate = previousClosed > 0 ? (previousWon / previousClosed) * 100 : null
  const deltaPoints =
    currentRate != null && previousRate != null ? currentRate - previousRate : null

  return {
    currentWon,
    currentLost,
    currentClosed,
    currentRate,
    previousWon,
    previousLost,
    previousClosed,
    previousRate,
    deltaPoints,
    previousMonthLabel: chartMonthLabel(previousMonthFrom),
  }
}

export function chartMonthLabel(day: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date(`${day.slice(0, 10)}T12:00:00+01:00`))
}
