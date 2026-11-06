import { firstSearchParam } from "@/lib/auth/return-to"

export const documentPageSize = 25

export const documentCategories = [
  ["offer", "Oferta"],
  ["integration", "Integracja"],
  ["contract", "Umowa"],
] as const

export type DocumentCategoryCode = (typeof documentCategories)[number][0]

export const documentCategoryStyles: Record<
  string,
  {
    dot: string
    badge: string
  }
> = {
  offer: {
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300",
  },
  integration: {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300",
  },
  contract: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  invoice: {
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-300",
  },
}

const defaultCategoryStyle = {
  dot: "bg-slate-400",
  badge: "border-border bg-muted text-muted-foreground",
}

export function documentCategoryStyle(code: string | null | undefined) {
  if (!code) return defaultCategoryStyle
  return documentCategoryStyles[code] ?? defaultCategoryStyle
}

const categoryLabels: Record<string, string> = {
  ...Object.fromEntries(documentCategories),
  invoice: "Faktura",
  other: "Inne",
}

const mimeLabels: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/plain": "TXT",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
}

const statusLabels: Record<string, string> = {
  uploading: "Wgrywanie",
  ready: "Gotowy",
  failed: "Błąd wysyłki",
  deleting: "Usuwanie",
}

export function documentCategoryText(code: string | null | undefined) {
  if (!code) return "Nie uzupełniono"
  return categoryLabels[code] ?? code
}

export function documentMimeText(mime: string | null | undefined) {
  if (!mime) return "Nie uzupełniono"
  return mimeLabels[mime] ?? mime
}

export function documentStatusText(status: string | null | undefined) {
  if (!status) return "Nie uzupełniono"
  return statusLabels[status] ?? status
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null) return "Nie uzupełniono"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function previewKind(mime: string) {
  if (mime === "application/pdf") return "pdf"
  if (mime === "image/png" || mime === "image/jpeg") return "image"
  return "download"
}

export type DocumentQuery = {
  q: string
  category: string
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

export function parseDocumentQuery(params: RawParams): DocumentQuery {
  const category = firstSearchParam(params.category) ?? ""
  const pageValue = Number(firstSearchParam(params.page))
  return {
    q: (firstSearchParam(params.q) ?? "").trim().slice(0, 120),
    category: documentCategories.some(([code]) => code === category) ? category : "",
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  }
}

export function documentsHref(query: DocumentQuery, patch: Partial<DocumentQuery> = {}) {
  const next = { ...query, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  if (next.category) params.set("category", next.category)
  if (next.page > 1) params.set("page", String(next.page))
  const search = params.toString()
  return search ? `/documents?${search}` : "/documents"
}
