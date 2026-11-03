import type { Metadata } from "next"
import Link from "next/link"
import { FileTextIcon, SearchIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { DocumentCleanup } from "@/components/crm/document-cleanup"
import { DocumentUpload } from "@/components/crm/document-upload"
import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getWorkspaceGate } from "@/lib/auth/access"
import {
  documentCategories,
  documentCategoryStyle,
  documentCategoryText,
  documentMimeText,
  documentPageSize,
  documentStatusText,
  documentsHref,
  formatFileSize,
  parseDocumentQuery,
} from "@/lib/crm/document-query"
import { getDocumentPolicy, listDocuments } from "@/lib/crm/document-read"
import { formatDateTime } from "@/lib/crm/format"
import { listMembers } from "@/lib/crm/queries"

export const metadata: Metadata = {
  title: "Dokumenty",
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseDocumentQuery(await searchParams)
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Brak dostępu</AlertTitle>
        <AlertDescription>Dokumenty są dostępne po zalogowaniu do obszaru roboczego.</AlertDescription>
      </Alert>
    )
  }

  const [policy, listed, members] = await Promise.all([
    getDocumentPolicy(),
    listDocuments(query),
    listMembers(),
  ])
  const names = new Map(members.map((member) => [member.userId, member.fullName]))
  const pages = Math.max(1, Math.ceil(listed.count / documentPageSize))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Dokumenty</h1>
            <p className="text-sm text-muted-foreground">
              {listed.count} {documentCountLabel(listed.count)}
            </p>
          </div>

          <nav
            aria-label="Filtr kategorii dokumentów"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            <Link
              href={documentsHref(query, { category: "", page: 1 })}
              className={cn(
                "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                !query.category
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              Wszystkie
            </Link>
            {documentCategories.map(([code, label]) => {
              const active = query.category === code
              const style = documentCategoryStyle(code)
              return (
                <Link
                  key={code}
                  href={documentsHref(query, { category: active ? "" : code, page: 1 })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    active
                      ? cn(style.badge, "shadow-2xs")
                      : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {policy.maxBytes && policy.mimeTypes.length ? (
            <DocumentUpload maxBytes={policy.maxBytes} mimeTypes={policy.mimeTypes} />
          ) : null}
        </div>
      </div>

      {!policy.maxBytes || !policy.mimeTypes.length ? (
        <Alert variant="destructive">
          <AlertTitle>Brak limitu wysyłki</AlertTitle>
          <AlertDescription>Nie udało się odczytać parametrów dokumentów.</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/documents" className="flex flex-1 items-center gap-2 sm:max-w-md">
          {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query.q}
              placeholder="Szukaj dokumentu po nazwie..."
              className="h-9 pl-9 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" size="lg">
            Szukaj
          </Button>
          {query.q || query.category ? (
            <Button
              variant="ghost"
              size="lg"
              nativeButton={false}
              render={<Link href="/documents" />}
            >
              <XIcon data-icon="inline-start" />
              Wyczyść
            </Button>
          ) : null}
        </form>

        <DocumentCleanup />
      </div>

      {listed.error ? (
        <Alert variant="destructive">
          <AlertTitle>Lista niedostępna</AlertTitle>
          <AlertDescription>{listed.error}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : null}

      {listed.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Brak dokumentów</EmptyTitle>
            <EmptyDescription>
              {query.q || query.category
                ? "Żaden dokument nie pasuje do wybranych filtrów."
                : "W tym widoku nie ma jeszcze żadnych plików. Kliknij „Dodaj dokument”, aby wgrać pierwszy plik."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Wielkość</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Powiązanie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.rows.map((row) => {
                  const catStyle = documentCategoryStyle(row.category)
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                            <FileTextIcon className="size-4" />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <Link
                              href={`/documents/${row.id}`}
                              className="truncate font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                              {row.originalName}
                            </Link>
                            <span className="text-xs text-muted-foreground">
                              {documentStatusText(row.status)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1.5", catStyle.badge)}>
                          <span className={cn("size-1.5 shrink-0 rounded-full", catStyle.dot)} />
                          {documentCategoryText(row.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{documentMimeText(row.mimeType)}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatFileSize(row.sizeBytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell>{names.get(row.uploadedBy) ?? "Nie uzupełniono"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.linkLabel}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {listed.rows.map((row) => {
              const catStyle = documentCategoryStyle(row.category)
              return (
                <li key={row.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/documents/${row.id}`}
                      className="inline-flex min-h-9 items-center font-medium text-foreground hover:text-primary"
                    >
                      {row.originalName}
                    </Link>
                    <Badge variant="outline" className={cn("shrink-0 gap-1.5", catStyle.badge)}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", catStyle.dot)} />
                      {documentCategoryText(row.category)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {documentMimeText(row.mimeType)} · {formatFileSize(row.sizeBytes)} ·{" "}
                    {documentStatusText(row.status)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)} · {names.get(row.uploadedBy) ?? "Nie uzupełniono"}
                  </p>
                  <p className="text-xs font-medium text-foreground">{row.linkLabel}</p>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {pages > 1 ? (
        <div className="flex gap-2">
          {query.page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={documentsHref(query, { page: query.page - 1 })} />}
            >
              Poprzednia
            </Button>
          ) : null}
          {query.page < pages ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={documentsHref(query, { page: query.page + 1 })} />}
            >
              Następna
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function documentCountLabel(count: number) {
  if (count === 1) return "dokument"
  const last = count % 10
  const teen = count % 100
  if (last >= 2 && last <= 4 && (teen < 12 || teen > 14)) return "dokumenty"
  return "dokumentów"
}
