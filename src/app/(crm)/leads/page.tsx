import type { Metadata } from "next"
import Link from "next/link"

import { LeadFilters } from "@/components/crm/lead-filters"
import { LeadRows } from "@/components/crm/lead-rows"
import { RetryLoad } from "@/components/shared/retry-load"
import { LeadForm } from "@/components/crm/lead-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { formatDay } from "@/lib/crm/format"
import { dealStages, missing } from "@/lib/crm/labels"
import { leadPageSize, leadsHref, parseLeadQuery } from "@/lib/crm/lead-query"
import { listLeads, listMembers, type LeadRow } from "@/lib/crm/queries"

export const metadata: Metadata = {
  title: "Leady",
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseLeadQuery(await searchParams)
  const [{ rows, count, error }, members] = await Promise.all([listLeads(query), listMembers()])
  const pages = Math.max(1, Math.ceil(count / leadPageSize))
  const listHref = leadsHref(query, { create: false })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leady</h1>
          <p className="text-sm text-muted-foreground">
            {count} {chanceLabel(count)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadFilters query={query} members={members} />
          <Button nativeButton={false} render={<Link href={leadsHref(query, { create: true })} />}>
            Nowy lead
          </Button>
        </div>
      </div>

      {query.create ? <LeadForm members={members} cancelHref={listHref} /> : null}
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
            <EmptyTitle>Brak leadów</EmptyTitle>
            <EmptyDescription>
              {query.q || query.stage || query.owner || query.product
                ? "Żaden rekord nie pasuje do filtrów."
                : "Dodaj pierwszą szansę ręcznie."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : query.view === "kanban" ? (
        <Kanban rows={rows} returnTo={listHref} />
      ) : (
        <LeadRows rows={rows.map(toLeadListItem)} returnTo={listHref} />
      )}

      {query.view === "table" && pages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Strony">
          {Array.from({ length: pages }, (_, index) => {
            const page = index + 1
            return (
              <Button
                key={page}
                variant={page === query.page ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={leadsHref(query, { page, create: false })} />}
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

function toLeadListItem(row: LeadRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    contactName: row.contact_name,
    companyName: row.company_name,
    productType: row.product_type,
    stage: row.stage,
    version: row.version,
    ownerName: row.owner_name,
    lastContactAt: row.last_contact_at,
    nextFollowUpOn: row.next_follow_up_on,
    setupAmount: row.setup_amount_gross_cents,
    monthlyAmount: row.monthly_amount_gross_cents,
    createdAt: row.created_at,
    email: row.contact_email,
    phone: row.contact_phone,
    archivedAt: row.archived_at,
  }
}

function Kanban({ rows, returnTo }: { rows: LeadRow[]; returnTo: string }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="flex w-max gap-3 pb-2">
        {dealStages.map(([code, label]) => {
          const items = rows.filter((row) => row.stage === code)
          return (
            <section key={code} className="flex w-72 flex-col gap-2">
              <h2 className="text-sm font-medium">
                {label} · {items.length}
              </h2>
              {items.map((row) => (
                <Link
                  key={row.id}
                  href={dealHref(row.id, returnTo)}
                  className="flex min-h-11 flex-col gap-1 rounded-xl border bg-card p-3"
                >
                  <span className="font-medium">{missing(row.contact_name ?? row.title)}</span>
                  <span className="text-sm text-muted-foreground">{missing(row.company_name)}</span>
                  <span className="text-sm">{formatDay(row.next_follow_up_on)}</span>
                </Link>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function chanceLabel(count: number) {
  const last = count % 10
  const teen = count % 100
  if (count === 1) return "szansa"
  if (last >= 2 && last <= 4 && (teen < 12 || teen > 14)) return "szanse"
  return "szans"
}

function dealHref(id: string, returnTo: string) {
  return `/leads/${id}?returnTo=${encodeURIComponent(returnTo)}`
}
