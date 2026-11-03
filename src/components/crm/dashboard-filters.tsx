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
import { monthBounds, parseDashboardQuery, type DashboardQuery } from "@/lib/crm/dashboard-query"

type Member = { userId: string; fullName: string }

function dashboardHref(query: DashboardQuery, today: string) {
  const bounds = monthBounds(today)
  const params = new URLSearchParams()
  if (query.from && query.from !== bounds?.from) params.set("from", query.from)
  if (query.to && query.to !== bounds?.to) params.set("to", query.to)
  if (query.owner) params.set("owner", query.owner)
  if (query.source) params.set("source", query.source)
  const text = params.toString()
  return text ? `/?${text}` : "/"
}

function activeDashboardFilterCount(query: DashboardQuery, today: string) {
  const bounds = monthBounds(today)
  let count = 0
  if (query.from && query.from !== bounds?.from) count += 1
  if (query.to && query.to !== bounds?.to) count += 1
  if (query.owner) count += 1
  if (query.source) count += 1
  return count
}

export function DashboardFilters({
  query,
  today,
  members,
  sources,
}: {
  query: DashboardQuery
  today: string
  members: Member[]
  sources: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const count = activeDashboardFilterCount(query, today)
  const sheetKey = [query.from, query.to, query.owner, query.source].join("|")

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
          <SheetDescription>Zakres dat, opiekun i źródło nowych szans.</SheetDescription>
        </SheetHeader>
        <form
          action="/"
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            applyDashboardFilters(event, today, router)
            setOpen(false)
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2">
            <label className="flex flex-col gap-1 text-sm">
              Okres od
              <input name="from" type="date" defaultValue={query.from} className={controlClassName} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Okres do
              <input name="to" type="date" defaultValue={query.to} className={controlClassName} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Opiekun szans i zadań
              <select name="owner" defaultValue={query.owner} className={controlClassName}>
                <option value="">Wszystkie osoby</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Źródło nowych szans
              <select name="source" defaultValue={query.source} className={controlClassName}>
                <option value="">Wszystkie źródła</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SheetFooter>
            <Button type="submit">Pokaż zakres</Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              Wyczyść
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    </HeaderSlot>
  )
}

function applyDashboardFilters(
  event: FormEvent<HTMLFormElement>,
  today: string,
  router: ReturnType<typeof useRouter>,
) {
  event.preventDefault()
  const params: Record<string, string> = {}
  for (const [key, value] of new FormData(event.currentTarget).entries()) {
    if (typeof value === "string") params[key] = value
  }
  const next = parseDashboardQuery(params, today)
  router.push(dashboardHref(next, today))
}
