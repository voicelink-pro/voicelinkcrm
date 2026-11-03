export const meetingPageSize = 25

export function meetingSyncText(status: string) {
  if (status === "synced") return "Zsynchronizowane"
  if (status === "partial") return "Częściowe"
  if (status === "error") return "Błąd"
  return "Oczekuje na treść"
}

export function meetingMatchText(state: string) {
  if (state === "needs_assignment") return "Do przypisania"
  if (state === "linked") return "Powiązane"
  return "Brak powiązania"
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) {
    return null
  }

  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} godz.` : `${hours} godz. ${rest} min`
}

export function parseMeetingQuery(params: Record<string, string | string[] | undefined>) {
  const raw = params.q
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 80)
  const pageRaw = params.page
  const pageNumber = Number(Array.isArray(pageRaw) ? pageRaw[0] : pageRaw)
  return {
    q,
    page: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  }
}

export function meetingsHref(query: { q?: string; page?: number }) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const text = params.toString()
  return text ? `/meetings?${text}` : "/meetings"
}
