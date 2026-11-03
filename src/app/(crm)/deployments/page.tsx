import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2Icon,
  CalendarIcon,
  EyeIcon,
  RocketIcon,
} from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDay } from "@/lib/crm/format"
import { implementationStageLabel, implementationStages } from "@/lib/crm/labels"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Wdrożenia",
}

const stageBadgeStyles: Record<string, { dot: string; badge: string }> = {
  todo: {
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
  },
  in_progress: {
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  },
  waiting_for_client: {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
  },
  testing: {
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
  },
  launched: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  completed: {
    dot: "bg-emerald-600",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  paused: {
    dot: "bg-zinc-400",
    badge: "border-zinc-200 bg-zinc-50 text-zinc-700",
  },
}

export default async function DeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const stageFilter = typeof params.stage === "string" ? params.stage : ""

  const supabase = await createClient()
  let req = supabase
    .from("accounts")
    .select(
      "id, display_name, implementation_stage, implementation_due_on, integration_systems, updated_at",
    )
    .eq("relationship", "client")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })

  if (stageFilter) {
    req = req.eq("implementation_stage", stageFilter)
  }

  const { data } = await req
  const rows = data ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Wdrożenia</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "klient we wdrożeniu" : "klientów we wdrożeniu"} · szybki podgląd etapów i terminów
          </p>
        </div>

        <nav
          aria-label="Filtr etapu wdrożenia"
          className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-2xs"
        >
          <Link
            href="/deployments"
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium transition-all",
              !stageFilter
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            Wszystkie
          </Link>
          {implementationStages.map(([code, label]) => {
            const active = stageFilter === code
            const st = stageBadgeStyles[code] ?? stageBadgeStyles.todo!
            return (
              <Link
                key={code}
                href={active ? "/deployments" : `/deployments?stage=${code}`}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all",
                  active
                    ? cn(st.badge, "shadow-2xs")
                    : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", st.dot)} />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {rows.length === 0 ? (
        <Empty className="rounded-2xl border bg-card py-12">
          <EmptyHeader>
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <RocketIcon className="size-5" />
            </div>
            <EmptyTitle>Brak wdrożeń dla wybranego filtra</EmptyTitle>
            <EmptyDescription>
              Stan wdrożenia oraz integracje każdego klienta edytujesz bezpośrednio w jego karcie.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/35 hover:bg-muted/35">
                <TableHead className="pl-4">Klient</TableHead>
                <TableHead>Etap wdrożenia</TableHead>
                <TableHead>Systemy integracji</TableHead>
                <TableHead>Termin</TableHead>
                <TableHead className="pr-4 text-right">Karta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const stage = row.implementation_stage ?? "todo"
                const st = stageBadgeStyles[stage] ?? stageBadgeStyles.todo!

                return (
                  <TableRow key={row.id} className="group">
                    <TableCell className="pl-4 font-medium">
                      <Link
                        href={`/accounts/${row.id}?returnTo=%2Fdeployments`}
                        className="inline-flex items-center gap-2.5 text-foreground hover:text-primary"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/30 text-primary">
                          <Building2Icon className="size-4" />
                        </span>
                        <span className="font-semibold">{row.display_name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          st.badge,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", st.dot)} />
                        {implementationStageLabel(stage)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                      {row.integration_systems || "Nie uzupełniono"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {row.implementation_due_on ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarIcon className="size-3.5 text-primary" />
                          {formatDay(row.implementation_due_on)}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-normal">
                          Brak terminu
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Otwórz wdrożenie klienta ${row.display_name}`}
                        nativeButton={false}
                        render={<Link href={`/accounts/${row.id}?returnTo=%2Fdeployments`} />}
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
      )}
    </div>
  )
}
