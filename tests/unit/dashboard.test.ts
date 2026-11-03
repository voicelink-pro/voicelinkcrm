import { describe, expect, it } from "vitest"

import { calculateRevenueTrend } from "@/components/crm/gross-revenue-card"
import {
  buildConversionComparison,
  chartMonthLabel,
  conversionText,
  monthBounds,
  parseDashboardQuery,
  previousMonthBounds,
} from "@/lib/crm/dashboard-query"
import { calendarDay } from "@/lib/crm/lead-query"
import { buildRevenueComparison, startOfIsoWeek } from "@/lib/crm/revenue-comparison"
import { searchPhrase } from "@/lib/crm/search-query"
import { tasksHref, parseTaskQuery } from "@/lib/crm/task-query"

describe("dashboard", () => {
  it("bierze bieżący miesiąc i odrzuca zły dzień", () => {
    expect(monthBounds("2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31" })
    expect(monthBounds("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(monthBounds("2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" })
    expect(calendarDay("2026-02-31")).toBe("")
    expect(parseDashboardQuery({}, "2026-10-31")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      owner: "",
      source: "",
    })
  })

  it("przy zerze zamknięć nie liczy skuteczności", () => {
    expect(conversionText(0, 0)).toBe("Brak danych")
    expect(conversionText(1, 1)).toBe("1 z 2")
    expect(chartMonthLabel("2026-10-01")).toMatch(/paź/i)
  })

  it("usuwa znaki wieloznaczne z frazy", () => {
    expect(searchPhrase("  100%_gabinet  ")).toBe("100 gabinet")
  })

  it("zostawia adres dzisiejszych zadań bez zmiany", () => {
    expect(tasksHref(parseTaskQuery({ view: "today", assignee: "me" }))).toBe(
      "/tasks?view=today&assignee=me",
    )
  })

  it("wylicza trend przychodu brutto między dwoma ostatnimi miesiącami", () => {
    expect(
      calculateRevenueTrend([
        { totalCents: 20000 },
        { totalCents: 25000 },
      ]),
    ).toEqual({
      kind: "up",
      percent: 25,
      deltaCents: 5000,
    })

    expect(
      calculateRevenueTrend([
        { totalCents: 0 },
        { totalCents: 10000 },
      ]),
    ).toEqual({
      kind: "up-from-zero",
      percent: 100,
      deltaCents: 10000,
    })
  })

  it("buduje porównania dla dnia, tygodnia kalendarzowego i miesiąca kalendarzowego", () => {
    // 2026-11-01 to niedziela, więc bieżący tydzień ISO to 2026-10-26 (pon.) – 2026-11-01 (niedz.)
    expect(startOfIsoWeek("2026-11-01")).toBe("2026-10-26")

    const comparison = buildRevenueComparison(
      "2026-11-01",
      [
        { month: "2026-10-01", setupCents: 100000, subscriptionCents: 0, totalCents: 100000 },
        { month: "2026-11-01", setupCents: 50000, subscriptionCents: 0, totalCents: 50000 },
      ],
      [
        { effectiveOn: "2026-10-27", amountSignedCents: 30000 },
        { effectiveOn: "2026-11-01", amountSignedCents: 50000 },
      ],
    )

    expect(comparison.day.currentCents).toBe(50000)
    expect(comparison.day.points).toHaveLength(7)
    expect(comparison.day.currentFrom).toBe("2026-11-01")
    expect(comparison.day.currentTo).toBe("2026-11-01")

    expect(comparison.week.currentCents).toBe(80000)
    expect(comparison.week.points).toHaveLength(6)
    expect(comparison.week.currentFrom).toBe("2026-10-26")
    expect(comparison.week.currentTo).toBe("2026-11-01")

    expect(comparison.month.currentCents).toBe(50000)
    expect(comparison.month.points).toHaveLength(2)
    expect(comparison.month.currentFrom).toBe("2026-11-01")
    expect(comparison.month.currentTo).toBe("2026-11-30")
  })

  it("wylicza poprzedni miesiąc i porównanie skuteczności zamknięć", () => {
    expect(previousMonthBounds("2026-11-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    })
    expect(previousMonthBounds("2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    })

    const comp = buildConversionComparison(3, 1, 1, 1, "2026-10-01")
    expect(comp.currentRate).toBe(75)
    expect(comp.previousRate).toBe(50)
    expect(comp.deltaPoints).toBe(25)
  })
})
