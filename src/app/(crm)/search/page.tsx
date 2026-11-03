import type { Metadata } from "next"
import Link from "next/link"

import { controlClassName } from "@/components/crm/control-styles"
import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { searchCrm, type SearchGroup } from "@/lib/crm/search-read"
import { parseSearchQuery, searchHref, searchPageSize, type SearchPageKey, type SearchQuery } from "@/lib/crm/search-query"

export const metadata: Metadata = {
  title: "Szukaj",
}

const groups: [SearchPageKey, string, keyof Awaited<ReturnType<typeof searchCrm>>][] = [
  ["accountsPage", "Firmy", "accounts"],
  ["contactsPage", "Kontakty", "contacts"],
  ["dealsPage", "Szanse", "deals"],
  ["tasksPage", "Zadania", "tasks"],
  ["documentsPage", "Dokumenty", "documents"],
]

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseSearchQuery(await searchParams)
  const results = query.q ? await searchCrm(query) : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Szukaj</h1>
        <p className="text-sm text-muted-foreground">
          Nazwy firm, kontaktów, szans, zadań i dokumentów. Treść transkrypcji nie jest przeszukiwana.
        </p>
      </div>
      <form action="/search" className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Fraza
          <input name="q" defaultValue={query.q} className={controlClassName} />
        </label>
        <Button type="submit">Szukaj</Button>
      </form>
      {!query.q ? <p className="text-sm text-muted-foreground">Wpisz frazę.</p> : null}
      {results ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map(([pageKey, title, resultKey]) => (
            <GroupCard
              key={resultKey}
              title={title}
              query={query}
              pageKey={pageKey}
              group={results[resultKey]}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function resultLabel(count: number) {
  if (count === 1) return "1 wynik"
  const last = count % 10
  const lastTwo = count % 100
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} wyniki`
  return `${count} wyników`
}

function GroupCard({
  title,
  query,
  pageKey,
  group,
}: {
  title: string
  query: SearchQuery
  pageKey: SearchPageKey
  group: SearchGroup
}) {
  const page = query[pageKey]
  const pages = Math.max(1, Math.ceil(group.count / searchPageSize))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {group.error ? "Grupa niedostępna." : resultLabel(group.count)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {group.error ? (
          <Alert variant="destructive">
            <AlertTitle>Błąd wyszukiwania</AlertTitle>
            <AlertDescription>{group.error}</AlertDescription>
            <RetryLoad />
          </Alert>
        ) : group.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wyników w tej grupie.</p>
        ) : (
          group.rows.map((row) => (
            <Link key={row.id} href={row.href} className="min-h-11 text-sm underline">
              {row.label}
            </Link>
          ))
        )}
        {pages > 1 ? (
          <div className="flex gap-2">
            {page > 1 ? (
              <Button variant="outline" nativeButton={false} render={<Link href={searchHref(query, { [pageKey]: page - 1 })} />}>
                Poprzednie
              </Button>
            ) : null}
            {page < pages ? (
              <Button variant="outline" nativeButton={false} render={<Link href={searchHref(query, { [pageKey]: page + 1 })} />}>
                Następne
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
