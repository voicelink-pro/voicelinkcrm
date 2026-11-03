import type { Metadata } from "next"
import Link from "next/link"
import {
  CalendarIcon,
  ClockIcon,
  PlayIcon,
  SearchIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { MeetingSyncBar } from "@/components/crm/meeting-sync-bar"
import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { getWorkspaceGate } from "@/lib/auth/access"
import { formatDateTime } from "@/lib/crm/format"
import {
  formatDuration,
  meetingPageSize,
  meetingSyncText,
  meetingsHref,
  parseMeetingQuery,
} from "@/lib/crm/meeting-query"
import { listMeetings } from "@/lib/crm/meeting-read"

export const metadata: Metadata = {
  title: "Spotkania",
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseMeetingQuery(await searchParams)
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Brak dostępu</AlertTitle>
        <AlertDescription>Spotkania są dostępne po zalogowaniu do obszaru roboczego.</AlertDescription>
      </Alert>
    )
  }

  const listed = await listMeetings(query)
  const pages = Math.max(1, Math.ceil(listed.count / meetingPageSize))
  const currentListHref = meetingsHref(query)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Spotkania</h1>
          <p className="text-sm text-muted-foreground">
            {listed.count} {countLabel(listed.count)} · najnowsze odbyte nagrania na górze
          </p>
        </div>

        <MeetingSyncBar />
      </div>

      {listed.message ? (
        <Alert variant="destructive">
          <AlertTitle>Lista niedostępna</AlertTitle>
          <AlertDescription>{listed.message}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : null}

      <form action="/meetings" className="flex items-center gap-2 sm:max-w-md">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query.q}
            placeholder="Szukaj spotkania po nazwie..."
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" size="lg">
          Szukaj
        </Button>
        {query.q ? (
          <Button
            variant="ghost"
            size="lg"
            nativeButton={false}
            render={<Link href="/meetings" />}
          >
            <XIcon data-icon="inline-start" />
            Wyczyść
          </Button>
        ) : null}
      </form>

      {listed.items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Brak spotkań</EmptyTitle>
            <EmptyDescription>
              {query.q
                ? "Żadne spotkanie nie pasuje do wpisanej frazy."
                : "Kliknij „Pobierz nagrania z Fathom” powyżej, aby zaimportować rozmowy z połączonego konta."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listed.items.map((meeting) => {
            const duration = formatDuration(meeting.durationSeconds)
            const href = `/meetings/${meeting.id}?returnTo=${encodeURIComponent(currentListHref)}`
            return (
              <Link
                key={meeting.id}
                href={href}
                scroll={false}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
              >
                {/* Górna część kafelka w stylu wideo / nagrania */}
                <div className="relative flex aspect-16/9 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-sidebar via-sidebar-accent to-primary/90 p-4 text-sidebar-foreground">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />

                  <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-xs transition-transform duration-200 group-hover:scale-110 group-hover:bg-white group-hover:text-primary">
                    <PlayIcon className="size-5 translate-x-0.5 fill-current" />
                  </div>

                  <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-black/35 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-xs">
                      <VideoIcon className="size-3" />
                      Fathom
                    </span>
                  </div>

                  {duration ? (
                    <span className="absolute right-2.5 bottom-2.5 z-10 inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] font-medium text-white tabular-nums backdrop-blur-xs">
                      <ClockIcon className="size-3" />
                      {duration}
                    </span>
                  ) : null}
                </div>

                {/* Dolny podpis: nazwa spotkania i niżej mniejszymi data i godzina */}
                <div className="flex flex-1 flex-col justify-between gap-2.5 p-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {meeting.title}
                    </h2>
                    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground/80" />
                      <span>{formatDateTime(meeting.startedAt)}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border/60 pt-2.5 text-[11px]">
                    {meeting.links.length > 0 ? (
                      <span className="truncate font-medium text-primary">
                        {meeting.links.map((l) => l.accountName).join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {meetingSyncText(meeting.syncStatus)}
                      </span>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      Otwórz →
                    </Badge>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {query.page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={meetingsHref({ q: query.q, page: query.page - 1 })} />}
            >
              Poprzednia
            </Button>
          ) : null}
          <span className="px-2 text-xs text-muted-foreground">
            Strona {query.page} z {pages}
          </span>
          {query.page < pages ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={meetingsHref({ q: query.q, page: query.page + 1 })} />}
            >
              Następna
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function countLabel(count: number) {
  if (count === 1) return "spotkanie"
  const rest = count % 10
  const tens = count % 100
  if (rest >= 2 && rest <= 4 && (tens < 12 || tens > 14)) return "spotkania"
  return "spotkań"
}
