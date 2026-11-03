"use client"

import { useState, type ReactNode } from "react"
import { ChevronDownIcon, EyeIcon } from "lucide-react"
import Link from "next/link"

import { LeadStatusPill } from "@/components/crm/lead-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDay } from "@/lib/crm/format"
import { missing } from "@/lib/crm/labels"
import { cn } from "cn"

export type LeadListItem = {
  id: string
  accountId: string
  title: string
  contactName: string | null
  companyName: string | null
  productType: string | null
  stage: string
  version: number
  ownerName: string | null
  lastContactAt: string | null
  nextFollowUpOn: string | null
  setupAmount: number | null
  monthlyAmount: number | null
  createdAt: string
  email: string | null
  phone: string | null
  archivedAt: string | null
}

export function LeadRows({ rows, returnTo }: { rows: LeadListItem[]; returnTo: string }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border bg-card" role="list">
      {rows.map((row) => {
        const open = openId === row.id
        const name = missing(row.contactName ?? row.title)
        const detailsId = `lead-details-${row.id}`
        return (
          <div key={row.id} role="listitem" className="border-b last:border-b-0">
            <div className="flex items-start">
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col px-3 text-left outline-none hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-expanded={open}
                aria-controls={detailsId}
                onClick={() => setOpenId(open ? null : row.id)}
              >
                <span className="flex min-h-11 items-center gap-2">
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  {row.companyName ? (
                    <span className="hidden min-w-0 max-w-[28%] truncate text-sm text-muted-foreground lg:block">
                      {row.companyName}
                    </span>
                  ) : null}
                  <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground md:block">
                    {row.nextFollowUpOn ? formatDay(row.nextFollowUpOn) : ""}
                  </span>
                </span>
                {!open && row.nextFollowUpOn ? (
                  <span className="truncate pb-1.5 ps-6 text-xs text-muted-foreground md:hidden">
                    Następny kontakt: {formatDay(row.nextFollowUpOn)}
                  </span>
                ) : null}
              </button>
              <div className="flex h-11 shrink-0 items-center gap-1 pe-1">
                <LeadStatusPill
                  key={`${row.id}-${row.stage}-${row.version}`}
                  dealId={row.id}
                  version={row.version}
                  stage={row.stage}
                  archived={Boolean(row.archivedAt)}
                />
                {row.archivedAt ? <Badge variant="outline">Archiwum</Badge> : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Szczegóły leada: ${name}`}
                  nativeButton={false}
                  render={<Link href={dealHref(row.id, returnTo)} scroll={false} />}
                >
                  <EyeIcon />
                </Button>
              </div>
            </div>
            {open ? (
              <div id={detailsId} className="border-t bg-muted/40 px-3 py-3">
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Telefon">
                    {row.phone ? (
                      <a className="underline-offset-4 hover:underline" href={`tel:${row.phone}`}>
                        {row.phone}
                      </a>
                    ) : (
                      "Nie uzupełniono"
                    )}
                  </Detail>
                  <Detail label="E-mail">
                    {row.email ? (
                      <a className="break-all underline-offset-4 hover:underline" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    ) : (
                      "Nie uzupełniono"
                    )}
                  </Detail>
                  <Detail label="Ostatni kontakt">{formatDay(row.lastContactAt)}</Detail>
                  <Detail label="Utworzono">{formatDay(row.createdAt)}</Detail>
                </dl>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function dealHref(id: string, returnTo: string) {
  return `/leads/${id}?returnTo=${encodeURIComponent(returnTo)}`
}
