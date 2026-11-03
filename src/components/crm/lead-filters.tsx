"use client"

import { useState, type FormEvent } from "react"
import { SlidersHorizontalIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { HeaderSlot } from "@/components/shell/header-slot"
import { controlClassName } from "@/components/crm/control-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { dealStages, productTypes } from "@/lib/crm/labels"
import { activeLeadFilterCount, leadsHref, parseLeadQuery, type LeadQuery } from "@/lib/crm/lead-query"

type Member = { userId: string; fullName: string }

export function LeadFilters({ query, members }: { query: LeadQuery; members: Member[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const count = activeLeadFilterCount(query)
  const clearHref = query.create ? "/leads?create=1" : "/leads"
  const sheetKey = [
    query.q,
    query.stage,
    query.owner,
    query.product,
    query.view,
    query.archived,
    query.sort,
    query.dir,
    query.source,
    query.createdFrom,
    query.createdTo,
    query.wonFrom,
    query.wonTo,
    query.lostFrom,
    query.lostTo,
    query.create,
  ].join("|")
  const hasRange = Boolean(
    query.source ||
      query.createdFrom ||
      query.createdTo ||
      query.wonFrom ||
      query.wonTo ||
      query.lostFrom ||
      query.lostTo,
  )

  return (
    <HeaderSlot>
    <Sheet key={sheetKey} open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        <SlidersHorizontalIcon data-icon="inline-start" />
        Filtry
        {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filtry</SheetTitle>
          <SheetDescription>Ustawienia listy. Po zastosowaniu zostają w adresie strony.</SheetDescription>
        </SheetHeader>
        <form
          action="/leads"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            applyFilters(event, query.create, router)
            setOpen(false)
          }}
        >
          {query.create ? <input type="hidden" name="create" value="1" /> : null}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2">
            <label className="flex flex-col gap-1 text-sm">
              Szukaj
              <input name="q" defaultValue={query.q} className={controlClassName} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Etap
              <select name="stage" defaultValue={query.stage} className={controlClassName}>
                <option value="">Wszystkie</option>
                {dealStages.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Opiekun
              <select name="owner" defaultValue={query.owner} className={controlClassName}>
                <option value="">Wszyscy</option>
                <option value="none">Bez opiekuna</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Produkt
              <select name="product" defaultValue={query.product} className={controlClassName}>
                <option value="">Wszystkie</option>
                {productTypes.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Widok
              <select name="view" defaultValue={query.view === "kanban" ? "kanban" : ""} className={controlClassName}>
                <option value="">Lista</option>
                <option value="kanban">Kanban</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Sortowanie
              <select name="sort" defaultValue={query.sort === "created_at" ? "" : query.sort} className={controlClassName}>
                <option value="">Data dodania</option>
                <option value="title">Tytuł</option>
                <option value="stage">Etap</option>
                <option value="next_follow_up_on">Następny kontakt</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Kierunek
              <select name="dir" defaultValue={query.dir === "desc" ? "" : "asc"} className={controlClassName}>
                <option value="">Malejąco</option>
                <option value="asc">Rosnąco</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="archived" value="1" defaultChecked={query.archived} />
              Pokaż zarchiwizowane
            </label>
            {hasRange ? (
              <div className="flex flex-col gap-3 border-t pt-3">
                <p className="text-sm text-muted-foreground">Zakres przekazany z dashboardu.</p>
                <label className="flex flex-col gap-1 text-sm">
                  Źródło
                  <input name="source" defaultValue={query.source} className={controlClassName} />
                </label>
                <DateField label="Utworzenie od" name="created_from" value={query.createdFrom} />
                <DateField label="Utworzenie do" name="created_to" value={query.createdTo} />
                <DateField label="Wygranie od" name="won_from" value={query.wonFrom} />
                <DateField label="Wygranie do" name="won_to" value={query.wonTo} />
                <DateField label="Przegranie od" name="lost_from" value={query.lostFrom} />
                <DateField label="Przegranie do" name="lost_to" value={query.lostTo} />
              </div>
            ) : null}
          </div>
          <SheetFooter>
            <Button type="submit">Zastosuj</Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={clearHref} />}
            >
              Wyczyść
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    </HeaderSlot>
  )
}

function applyFilters(
  event: FormEvent<HTMLFormElement>,
  create: boolean,
  router: ReturnType<typeof useRouter>,
) {
  event.preventDefault()
  const params: Record<string, string> = {}
  for (const [key, value] of new FormData(event.currentTarget).entries()) {
    if (typeof value === "string") params[key] = value
  }
  const next = parseLeadQuery(params)
  router.push(leadsHref({ ...next, page: 1, create }))
}

function DateField({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input type="date" name={name} defaultValue={value} className={controlClassName} />
    </label>
  )
}
