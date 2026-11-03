import type { Metadata } from "next"
import Link from "next/link"

import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDay, formatGrosze } from "@/lib/crm/format"
import { warsawToday } from "@/lib/crm/finance"
import { monthBounds } from "@/lib/crm/dashboard-query"
import { listPeriodRevenue } from "@/lib/crm/revenue-read"
import { parseRevenueQuery, revenueHref, revenuePageSize } from "@/lib/crm/revenue-query"

export const metadata: Metadata = {
  title: "Ewidencja",
}

const kindLabel = {
  all: "Cała ewidencja okresu",
  setup: "Opłaty jednorazowe i ich korekty",
  subscription: "Abonamenty okresu i ich korekty",
  active: "Aktywne dziś abonamenty wygranych szans",
} as const

const entryLabel: Record<string, string> = {
  setup: "Jednorazowa",
  subscription: "Abonament",
  correction: "Korekta",
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parsed = parseRevenueQuery(await searchParams)
  const today = await warsawToday()
  const bounds = monthBounds(today)
  const query = {
    ...parsed,
    from: parsed.kind === "active" ? parsed.from : parsed.from || bounds?.from || today,
    to: parsed.kind === "active" ? parsed.to : parsed.to || bounds?.to || today,
  }
  const { list, message } = await listPeriodRevenue(query.kind, query.from, query.to, query.owner, query.page)
  const pages = Math.max(1, Math.ceil((list?.count ?? 0) / revenuePageSize))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ewidencja</h1>
        <p className="text-sm text-muted-foreground">
          {kindLabel[query.kind]}. To zapisane naliczenia, nie wpłaty i nie zysk.
          {query.kind === "active"
            ? " Kwota jest stanem na dziś."
            : ` Zakres ${formatDay(query.from)} – ${formatDay(query.to)}.`}
        </p>
      </div>
      {message || !list ? (
        <Alert variant="destructive">
          <AlertTitle>Ewidencja niedostępna</AlertTitle>
          <AlertDescription>{message ?? "Nie udało się wczytać ewidencji."}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : (
        <>
          <p className="text-sm">
            Suma całego zakresu: {formatGrosze(list.totalCents)}. Pozycji: {list.count}.
          </p>
          {query.kind === "active" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Szansa</TableHead>
                  <TableHead>Kwota miesięczna</TableHead>
                  <TableHead>Od</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.agreements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/accounts/${row.accountId}`} className="underline">{row.accountName}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${row.dealId}`} className="underline">{row.dealTitle}</Link>
                    </TableCell>
                    <TableCell>{formatGrosze(row.amountGrossCents)}</TableCell>
                    <TableCell>{formatDay(row.startsOn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Rodzaj</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Szansa</TableHead>
                  <TableHead>Kwota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDay(row.effectiveOn)}</TableCell>
                    <TableCell>{entryLabel[row.entryType] ?? row.entryType}</TableCell>
                    <TableCell>
                      <Link href={`/accounts/${row.accountId}`} className="underline">{row.accountName}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${row.dealId}`} className="underline">{row.dealTitle}</Link>
                    </TableCell>
                    <TableCell>{formatGrosze(row.amountSignedCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {list.count === 0 ? <p className="text-sm text-muted-foreground">Brak pozycji w tym zakresie.</p> : null}
          {pages > 1 ? (
            <nav className="flex gap-2" aria-label="Strony ewidencji">
              {query.page > 1 ? (
                <Button variant="outline" nativeButton={false} render={<Link href={revenueHref(query, { page: query.page - 1 })} />}>
                  Poprzednie
                </Button>
              ) : null}
              {query.page < pages ? (
                <Button variant="outline" nativeButton={false} render={<Link href={revenueHref(query, { page: query.page + 1 })} />}>
                  Następne
                </Button>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}
