import { firstSearchParam } from "@/lib/auth/return-to"
import { calendarDay } from "@/lib/crm/lead-query"

export const revenuePageSize = 25

const kinds = ["all", "setup", "subscription", "active"] as const

export type RevenueKind = (typeof kinds)[number]

const userPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RevenueQuery = {
  kind: RevenueKind
  from: string
  to: string
  owner: string
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

export function parseRevenueQuery(params: RawParams): RevenueQuery {
  const kindValue = firstSearchParam(params.kind) ?? "all"
  const owner = (firstSearchParam(params.owner) ?? "").trim()
  const pageValue = Number(firstSearchParam(params.page))

  return {
    kind: kinds.includes(kindValue as RevenueKind) ? (kindValue as RevenueKind) : "all",
    from: calendarDay(firstSearchParam(params.from)),
    to: calendarDay(firstSearchParam(params.to)),
    owner: userPattern.test(owner) ? owner : "",
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  }
}

export function revenueHref(query: RevenueQuery, patch: Partial<RevenueQuery> = {}) {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.kind !== "all") params.set("kind", next.kind)
  if (next.kind !== "active" && next.from) params.set("from", next.from)
  if (next.kind !== "active" && next.to) params.set("to", next.to)
  if (next.kind === "active" && next.owner) params.set("owner", next.owner)
  if (next.page > 1) params.set("page", String(next.page))
  const search = params.toString()
  return search ? `/revenue?${search}` : "/revenue"
}
