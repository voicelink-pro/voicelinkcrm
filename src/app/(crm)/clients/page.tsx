import type { Metadata } from "next"
import Link from "next/link"
import {
  ArchiveIcon,
  Building2Icon,
  EyeIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { cn } from "cn"

import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clientsHref, parseClientQuery, type ClientQuery } from "@/lib/crm/client-query"
import { formatDateTime } from "@/lib/crm/format"
import { missing, productLabel } from "@/lib/crm/labels"
import { leadPageSize } from "@/lib/crm/lead-query"
import { listClients } from "@/lib/crm/queries"

export const metadata: Metadata = {
  title: "Klienci",
}

function buildFilterHref(query: ClientQuery, patch: Partial<ClientQuery>) {
  return clientsHref({ ...query, ...patch, page: 1 }, 1)
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseClientQuery(await searchParams)
  const { rows, count, error } = await listClients(query)
  const pages = Math.max(1, Math.ceil(count / leadPageSize))
  const hasFilters = Boolean(query.q || query.service || query.archived)

  return (
    <div className="flex flex-col gap-6">
      {/* Nagłówek + kompaktowy pasek wyszukiwania i filtrów po prawej na wysokości napisu Klienci */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Klienci</h1>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? "klient" : "klientów"} · firmy z wygraną szansą
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Kompaktowy przełącznik statusu obsługi */}
          <nav
            aria-label="Filtr statusu obsługi"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            <Link
              href={buildFilterHref(query, { service: "" })}
              className={cn(
                "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                !query.service
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              Wszyscy
            </Link>
            <Link
              href={buildFilterHref(query, { service: query.service === "active" ? "" : "active" })}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                query.service === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-2xs"
                  : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Aktywni
            </Link>
            <Link
              href={buildFilterHref(query, { service: query.service === "inactive" ? "" : "inactive" })}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                query.service === "inactive"
                  ? "border-amber-200 bg-amber-50 text-amber-800 shadow-2xs"
                  : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              Nieaktywni
            </Link>
          </nav>

          {/* Kompaktowy przełącznik archiwum */}
          <Link
            href={buildFilterHref(query, { archived: !query.archived })}
            title="Pokaż lub ukryj zarchiwizowanych klientów"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shadow-2xs",
              query.archived
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <ArchiveIcon className="size-3.5" />
            <span>Archiwum</span>
          </Link>

          {/* Kompaktowa wyszukiwarka */}
          <form action="/clients" className="flex items-center gap-1.5">
            {query.service ? <input type="hidden" name="service" value={query.service} /> : null}
            {query.archived ? <input type="hidden" name="archived" value="1" /> : null}
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={query.q}
                placeholder="Szukaj klienta..."
                className="h-9 w-44 pl-8 text-xs sm:w-56"
              />
            </div>
            <Button type="submit" variant="outline" size="lg">
              Szukaj
            </Button>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="icon-lg"
                title="Wyczyść filtry"
                aria-label="Wyczyść filtry"
                nativeButton={false}
                render={<Link href="/clients" />}
              >
                <XIcon />
              </Button>
            ) : null}
          </form>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Lista niedostępna</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Brak klientów</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? "Żaden klient nie pasuje do wybranych filtrów."
                : "Klient pojawia się na liście po finalizacji wygranej szansy."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-2xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="pl-4">Klient</TableHead>
                  <TableHead>Kontakt główny</TableHead>
                  <TableHead>Opiekun</TableHead>
                  <TableHead>Produkty</TableHead>
                  <TableHead>Subskrypcje</TableHead>
                  <TableHead>Obsługa</TableHead>
                  <TableHead>Ostatnia aktywność</TableHead>
                  <TableHead className="w-16 pr-4 text-right">Szczegóły</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isActive = row.service_status !== "inactive"
                  return (
                    <TableRow key={row.id} className="group">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                            <Building2Icon className="size-4" />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <Link
                              className="truncate font-semibold text-foreground underline-offset-4 group-hover:text-primary hover:underline"
                              href={`/accounts/${row.id}`}
                            >
                              {row.display_name}
                            </Link>
                            {row.company_name && row.company_name !== row.display_name ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {row.company_name}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground/90">
                        {missing(row.primary_contact_name)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {missing(row.owner_name)}
                      </TableCell>
                      <TableCell>
                        <ProductBadges value={row.active_products} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="tabular-nums">
                          {row.active_subscription_count ?? 0} aktywne
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "gap-1.5",
                            isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-800",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              isActive ? "bg-emerald-500" : "bg-amber-500",
                            )}
                          />
                          {isActive ? "Aktywny" : "Nieaktywny"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(row.last_activity_at)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Szczegóły klienta: ${row.display_name}`}
                          title={`Przejdź do szczegółów: ${row.display_name}`}
                          nativeButton={false}
                          render={<Link href={`/accounts/${row.id}`} />}
                          className="text-muted-foreground hover:bg-secondary hover:text-primary"
                        >
                          <EyeIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => {
              const isActive = row.service_status !== "inactive"
              return (
                <article
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Building2Icon className="size-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <Link
                          className="truncate font-semibold text-foreground"
                          href={`/accounts/${row.id}`}
                        >
                          {row.display_name}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {missing(row.primary_contact_name)}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Szczegóły klienta: ${row.display_name}`}
                      nativeButton={false}
                      render={<Link href={`/accounts/${row.id}`} />}
                    >
                      <EyeIcon />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1.5",
                        isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          isActive ? "bg-emerald-500" : "bg-amber-500",
                        )}
                      />
                      {isActive ? "Aktywny" : "Nieaktywny"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Subskrypcje: {row.active_subscription_count ?? 0}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {pages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Strony">
          {Array.from({ length: pages }, (_, index) => {
            const page = index + 1
            return (
              <Button
                key={page}
                variant={page === query.page ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={clientsHref(query, page)} />}
              >
                {page}
              </Button>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}

function ProductBadges({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-xs text-muted-foreground">Nie uzupełniono</span>
  }

  const codes = value.split(",").filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <Badge key={code} variant="outline" className="text-xs">
          {productLabel(code)}
        </Badge>
      ))}
    </div>
  )
}
