import { firstSearchParam } from "@/lib/auth/return-to"
import { dealStages, productTypes } from "@/lib/crm/labels"

export const leadPageSize = 25

const sorts = ["created_at", "title", "stage", "next_follow_up_on"] as const

export function calendarDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ""
  }

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ""
  }

  return value
}
const stageCodes = new Set<string>(dealStages.map(([code]) => code))
const productCodes = new Set<string>(productTypes.map(([code]) => code))

export type LeadQuery = {
  q: string
  stage: string
  owner: string
  product: string
  source: string
  createdFrom: string
  createdTo: string
  wonFrom: string
  wonTo: string
  lostFrom: string
  lostTo: string
  view: "table" | "kanban"
  archived: boolean
  sort: (typeof sorts)[number]
  dir: "asc" | "desc"
  page: number
  create: boolean
}

type RawParams = Record<string, string | string[] | undefined>

export function parseLeadQuery(params: RawParams): LeadQuery {
  const sortValue = firstSearchParam(params.sort)
  const stageValue = firstSearchParam(params.stage) ?? ""
  const productValue = firstSearchParam(params.product) ?? ""
  const pageValue = Number(firstSearchParam(params.page))

  return {
    q: (firstSearchParam(params.q) ?? "").trim().slice(0, 80),
    stage: stageCodes.has(stageValue) ? stageValue : "",
    owner: (firstSearchParam(params.owner) ?? "").trim(),
    product: productCodes.has(productValue) ? productValue : "",
    source: (firstSearchParam(params.source) ?? "").trim().slice(0, 80),
    createdFrom: calendarDay(firstSearchParam(params.created_from)),
    createdTo: calendarDay(firstSearchParam(params.created_to)),
    wonFrom: calendarDay(firstSearchParam(params.won_from)),
    wonTo: calendarDay(firstSearchParam(params.won_to)),
    lostFrom: calendarDay(firstSearchParam(params.lost_from)),
    lostTo: calendarDay(firstSearchParam(params.lost_to)),
    view: firstSearchParam(params.view) === "kanban" ? "kanban" : "table",
    archived: firstSearchParam(params.archived) === "1",
    sort: sorts.includes(sortValue as (typeof sorts)[number])
      ? (sortValue as (typeof sorts)[number])
      : "created_at",
    dir: firstSearchParam(params.dir) === "asc" ? "asc" : "desc",
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    create: firstSearchParam(params.create) === "1",
  }
}

export function leadQueryString(
  query: LeadQuery,
  overrides: Partial<LeadQuery> = {},
) {
  const next = { ...query, ...overrides }
  const params = new URLSearchParams()

  if (next.q) params.set("q", next.q)
  if (next.stage) params.set("stage", next.stage)
  if (next.owner) params.set("owner", next.owner)
  if (next.product) params.set("product", next.product)
  if (next.source) params.set("source", next.source)
  if (next.createdFrom) params.set("created_from", next.createdFrom)
  if (next.createdTo) params.set("created_to", next.createdTo)
  if (next.wonFrom) params.set("won_from", next.wonFrom)
  if (next.wonTo) params.set("won_to", next.wonTo)
  if (next.lostFrom) params.set("lost_from", next.lostFrom)
  if (next.lostTo) params.set("lost_to", next.lostTo)
  if (next.view === "kanban") params.set("view", "kanban")
  if (next.archived) params.set("archived", "1")
  if (next.sort !== "created_at") params.set("sort", next.sort)
  if (next.dir !== "desc") params.set("dir", next.dir)
  if (next.page > 1) params.set("page", String(next.page))
  if (next.create) params.set("create", "1")

  return params.toString()
}

export function leadsHref(query: LeadQuery, overrides: Partial<LeadQuery> = {}) {
  const search = leadQueryString(query, overrides)
  return search ? `/leads?${search}` : "/leads"
}

export function activeLeadFilterCount(query: LeadQuery) {
  const values = [
    query.q,
    query.stage,
    query.owner,
    query.product,
    query.source,
    query.createdFrom,
    query.createdTo,
    query.wonFrom,
    query.wonTo,
    query.lostFrom,
    query.lostTo,
  ]
  let count = values.filter((value) => value.length > 0).length
  if (query.archived) count += 1
  if (query.view === "kanban") count += 1
  if (query.sort !== "created_at" || query.dir !== "desc") count += 1
  return count
}
