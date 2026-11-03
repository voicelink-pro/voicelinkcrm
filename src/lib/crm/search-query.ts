import { firstSearchParam } from "@/lib/auth/return-to"

export const searchPageSize = 5

const pageKeys = [
  "accountsPage",
  "contactsPage",
  "dealsPage",
  "tasksPage",
  "documentsPage",
] as const

export type SearchPageKey = (typeof pageKeys)[number]

export type SearchQuery = {
  q: string
} & Record<SearchPageKey, number>

type RawParams = Record<string, string | string[] | undefined>

const paramNames: Record<SearchPageKey, string> = {
  accountsPage: "accounts_page",
  contactsPage: "contacts_page",
  dealsPage: "deals_page",
  tasksPage: "tasks_page",
  documentsPage: "documents_page",
}

function pageNumber(value: string | null | undefined) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function searchPhrase(value: string) {
  return value.replace(/[%_\\,.*()"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}

export function parseSearchQuery(params: RawParams): SearchQuery {
  return {
    q: searchPhrase(firstSearchParam(params.q) ?? ""),
    accountsPage: pageNumber(firstSearchParam(params.accounts_page)),
    contactsPage: pageNumber(firstSearchParam(params.contacts_page)),
    dealsPage: pageNumber(firstSearchParam(params.deals_page)),
    tasksPage: pageNumber(firstSearchParam(params.tasks_page)),
    documentsPage: pageNumber(firstSearchParam(params.documents_page)),
  }
}

export function searchHref(query: SearchQuery, patch: Partial<SearchQuery> = {}) {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  for (const key of pageKeys) {
    if (next[key] > 1) params.set(paramNames[key], String(next[key]))
  }
  const search = params.toString()
  return search ? `/search?${search}` : "/search"
}
