"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { cn } from "cn"

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatGrosze } from "@/lib/crm/format"
import type { RevenueComparisonData, RevenueGranularity } from "@/lib/crm/revenue-comparison"
import { parseRevenueQuery, revenueHref } from "@/lib/crm/revenue-query"

const chartConfig = {
  totalZl: {
    label: "Przychód brutto",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const granularityOptions: { value: RevenueGranularity; label: string }[] = [
  { value: "day", label: "Dzień" },
  { value: "week", label: "Tydzień" },
  { value: "month", label: "Miesiąc" },
]

export function calculateRevenueTrend(rows: { totalCents: number }[]) {
  if (rows.length < 2) {
    return { kind: "flat" as const, percent: 0, deltaCents: 0 }
  }

  const current = rows[rows.length - 1]?.totalCents ?? 0
  const previous = rows[rows.length - 2]?.totalCents ?? 0
  const deltaCents = current - previous

  if (previous === 0) {
    if (current > 0) {
      return { kind: "up-from-zero" as const, percent: 100, deltaCents }
    }
    if (current < 0) {
      return { kind: "down-from-zero" as const, percent: -100, deltaCents }
    }
    return { kind: "flat" as const, percent: 0, deltaCents: 0 }
  }

  const percent = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(percent) < 0.05) {
    return { kind: "flat" as const, percent: 0, deltaCents }
  }

  return {
    kind: percent > 0 ? ("up" as const) : ("down" as const),
    percent,
    deltaCents,
  }
}

export function GrossRevenueCard({
  comparison,
}: {
  comparison: RevenueComparisonData
}) {
  const [granularity, setGranularity] = useState<RevenueGranularity>("month")

  const series = comparison[granularity]
  const href = revenueHref(
    parseRevenueQuery({
      from: series.currentFrom,
      to: series.currentTo,
    }),
  )

  const chartData = series.points.map((point) => ({
    label: point.shortLabel,
    fullLabel: point.fullLabel,
    totalZl: Number((point.totalCents / 100).toFixed(2)),
    totalCents: point.totalCents,
  }))

  const trend = calculateRevenueTrend(series.points)
  const totalSeriesCents = series.points.reduce((sum, point) => sum + point.totalCents, 0)

  const percentFormatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(trend.percent))

  const previousUnitName =
    granularity === "day"
      ? "poprzedniego dnia"
      : granularity === "week"
        ? "poprzedniego tygodnia"
        : "poprzedniego miesiąca"

  const summaryRangeName =
    granularity === "day"
      ? "ostatnich 7 dni"
      : granularity === "week"
        ? "ostatnich 6 tygodni"
        : "ostatnich 6 miesięcy"

  return (
    <Card className="md:col-span-2">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            <Link
              href={href}
              title="Suma pozycji ewidencji z datą naliczenia w wybranym okresie, łącznie z korektami. Nie zależy od liczby wdrożeń."
              className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
            >
              Przychód brutto
              <ArrowUpRight className="size-4 text-primary" />
            </Link>
          </CardTitle>
          <p className="text-2xl font-bold tracking-tight text-primary sm:text-3xl tabular-nums">
            {formatGrosze(series.currentCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            {series.currentLabel}
          </p>
        </div>

        <CardAction>
          <div
            role="group"
            aria-label="Zakres czasu przychodu brutto"
            className="inline-flex items-center rounded-lg bg-muted p-1"
          >
            {granularityOptions.map((option) => {
              const active = granularity === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGranularity(option.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-2">
        <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              top: 12,
              left: 12,
              right: 12,
              bottom: 0,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              hide
              domain={[
                (dataMin: number) => Math.min(0, dataMin),
                (dataMax: number) => (dataMax <= 0 ? 100 : Math.ceil(dataMax * 1.15)),
              ]}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-totalZl)", strokeOpacity: 0.2, strokeWidth: 1.5 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as
                      | { fullLabel?: string }
                      | undefined
                    return item?.fullLabel ?? ""
                  }}
                  formatter={(value, _name, item) => {
                    const row = item.payload as { totalCents?: number } | undefined
                    const cents = row?.totalCents ?? Number(value) * 100
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">Przychód brutto</span>
                        <span className="font-mono font-semibold text-foreground tabular-nums">
                          {formatGrosze(Math.round(cents))}
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Line
              dataKey="totalZl"
              type="linear"
              stroke="var(--color-totalZl)"
              strokeWidth={2.5}
              isAnimationActive={false}
              dot={{
                r: 4,
                fill: "var(--color-totalZl)",
                strokeWidth: 2,
                stroke: "var(--card)",
              }}
              activeDot={{
                r: 6,
                fill: "var(--color-totalZl)",
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className="flex-col items-start gap-1.5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 leading-none font-medium text-foreground">
            {trend.kind === "up" ? (
              <>
                Wzrost o {percentFormatted}% względem {previousUnitName} ({formatGrosze(trend.deltaCents)} więcej)
                <TrendingUp className="size-4 text-primary" />
              </>
            ) : trend.kind === "up-from-zero" ? (
              <>
                Wzrost o {formatGrosze(trend.deltaCents)} względem {previousUnitName}
                <TrendingUp className="size-4 text-primary" />
              </>
            ) : trend.kind === "down" || trend.kind === "down-from-zero" ? (
              <>
                Spadek o {percentFormatted}% względem {previousUnitName} ({formatGrosze(Math.abs(trend.deltaCents))} mniej)
                <TrendingDown className="size-4 text-destructive" />
              </>
            ) : (
              <>
                Bez zmian względem {previousUnitName} (0,0%)
                <Minus className="size-4 text-muted-foreground" />
              </>
            )}
          </div>
          <div className="leading-none text-muted-foreground">
            Suma z {summaryRangeName}: <span className="font-medium text-foreground">{formatGrosze(totalSeriesCents)}</span>
          </div>
        </div>
        <Link
          href={href}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Otwórz ewidencję →
        </Link>
      </CardFooter>
    </Card>
  )
}
