import { firstSearchParam } from "@/lib/auth/return-to"

export type ClientQuery = {
  q: string
  service: "" | "active" | "inactive"
  archived: boolean
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

export function parseClientQuery(params: RawParams): ClientQuery {
  const service = firstSearchParam(params.service) ?? ""
  const pageValue = Number(firstSearchParam(params.page))

  return {
    q: (firstSearchParam(params.q) ?? "").trim().slice(0, 80),
    service: service === "active" || service === "inactive" ? service : "",
    archived: firstSearchParam(params.archived) === "1",
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  }
}

export function clientsHref(query: ClientQuery, page = query.page) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.service) params.set("service", query.service)
  if (query.archived) params.set("archived", "1")
  if (page > 1) params.set("page", String(page))
  const search = params.toString()
  return search ? `/clients?${search}` : "/clients"
}
