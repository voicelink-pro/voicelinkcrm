import Link from "next/link"
import {
  Building2Icon,
  CalendarIcon,
  ClockIcon,
  FileTextIcon,
  ListChecksIcon,
  MessageSquareIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"

import {
  ActionItemForm,
  MeetingDetachForm,
  MeetingLinkForm,
  MeetingNoteForm,
  RetryContentForm,
} from "@/components/crm/meeting-forms"
import { MeetingSheet } from "@/components/crm/meeting-sheet"
import { MeetingSummary } from "@/components/crm/meeting-summary"
import { MeetingTranscript } from "@/components/crm/meeting-transcript"
import { MeetingVideoPlayer } from "@/components/crm/meeting-video-player"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDateTime } from "@/lib/crm/format"
import { formatDuration, meetingMatchText, meetingSyncText } from "@/lib/crm/meeting-query"
import { getMeeting, meetingDirectories } from "@/lib/crm/meeting-read"
import { fathomRecordingUrl } from "@/lib/integrations/fathom/urls"

type ActionItem = {
  description?: string
  assignee_name?: string | null
  assignee_email?: string | null
  timestamp?: string | null
}

function actionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is ActionItem => {
    return Boolean(item && typeof item === "object" && "description" in item && item.description)
  })
}

export async function MeetingDetail({
  meetingId,
  presentation = "page",
  backHref = "/meetings",
}: {
  meetingId: string
  presentation?: "page" | "sheet"
  backHref?: string
}) {
  const [loaded, directories] = await Promise.all([
    getMeeting(meetingId),
    meetingDirectories(),
  ])

  const memberNames = new Map(directories.members.map((m) => [m.id, m.label]))

  if (loaded.message) {
    const alert = (
      <Alert variant="destructive">
        <AlertTitle>Spotkanie niedostępne</AlertTitle>
        <AlertDescription>{loaded.message}</AlertDescription>
      </Alert>
    )
    return presentation === "sheet" ? (
      <MeetingSheet backHref={backHref}>
        <div className="p-6">{alert}</div>
      </MeetingSheet>
    ) : (
      alert
    )
  }

  if (!loaded.meeting) {
    const empty = (
      <Alert>
        <AlertTitle>Nie znaleziono spotkania</AlertTitle>
        <AlertDescription>
          <Link href={backHref} className="underline">
            Wróć do listy spotkań
          </Link>
        </AlertDescription>
      </Alert>
    )
    return presentation === "sheet" ? (
      <MeetingSheet backHref={backHref}>
        <div className="p-6">{empty}</div>
      </MeetingSheet>
    ) : (
      empty
    )
  }

  const meeting = loaded.meeting
  const recordingUrl =
    fathomRecordingUrl(meeting.share_url) ?? fathomRecordingUrl(meeting.recording_url)
  const duration = formatDuration(meeting.duration_seconds)
  const suggestions = actionItems(meeting.provider_action_items)

  const body = (
    <div className="flex flex-col gap-6">
      {presentation === "page" ? (
        <div className="flex flex-col gap-3 border-b border-border pb-5">
          <div>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={backHref} />}
            >
              ← Wróć do spotkań
            </Button>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="size-4 text-primary" />
                  {formatDateTime(meeting.started_at)}
                </span>
                {duration ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="size-4 text-primary" />
                    {duration}
                  </span>
                ) : null}
                {meeting.recorded_by_email ? (
                  <span>Prowadzący: {meeting.recorded_by_email}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{meetingSyncText(meeting.sync_status)}</Badge>
              <Badge variant="outline">{meetingMatchText(meeting.matching_state)}</Badge>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sekcja 1: Nagranie wideo z API */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <VideoIcon className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Nagranie spotkania</h2>
          </div>
          <RetryContentForm meetingId={meeting.id} />
        </div>
        {meeting.content_error ? (
          <p className="text-xs text-destructive">
            Ostatni błąd pobierania treści: {meeting.content_error}. Metadane są zachowane.
          </p>
        ) : null}
        <MeetingVideoPlayer
          meetingId={meeting.id}
          title={meeting.title}
          fallbackUrl={recordingUrl}
        />
      </section>

      {/* Sekcja 2: Notatka ze spotkania (Podsumowanie) oraz Komentarze obok siebie na szerokich ekranach */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Notatka ze spotkania</h2>
            </div>
            <Badge variant="secondary">Podsumowanie AI</Badge>
          </div>
          {meeting.summary_markdown ? (
            <MeetingSummary markdown={meeting.summary_markdown} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Notatka podsumowująca jeszcze nie dotarła z Fathoma. Kliknij „Odśwież treść z Fathom” powyżej.
            </p>
          )}
        </section>

        {/* Sekcja 3: Komentarze do spotkania */}
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquareIcon className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Komentarze do spotkania</h2>
            </div>
            <Badge variant="outline">{meeting.notes.length}</Badge>
          </div>

          <MeetingNoteForm meetingId={meeting.id} />

          {meeting.notes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Brak komentarzy do tego spotkania. Dodaj pierwszy komentarz powyżej.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {meeting.notes.map((note) => (
                <li
                  key={note.id}
                  className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-sm"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {memberNames.get(note.created_by) ?? "Członek zespołu"}
                    </span>
                    <span>{formatDateTime(note.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-foreground/90">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sekcja 4: Powiązania i Uczestnicy */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <Building2Icon className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Powiązania CRM</h2>
          </div>
          {meeting.matching_state === "needs_assignment" ? (
            <p className="text-xs text-amber-700">
              Do przypisania: znaleziono więcej niż jedną pasującą firmę lub otwartą szansę.
            </p>
          ) : null}
          {meeting.links.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {meeting.links.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/accounts/${link.accountId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {link.accountName}
                    </Link>
                    {link.dealId && link.dealTitle ? (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <Link
                          href={`/leads/${link.dealId}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {link.dealTitle}
                        </Link>
                      </>
                    ) : null}
                  </div>
                  <MeetingDetachForm meetingId={meeting.id} linkId={link.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Brak przypisanego klienta lub szansy.</p>
          )}
          <MeetingLinkForm
            meetingId={meeting.id}
            accounts={directories.accounts}
            deals={directories.deals}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <UsersIcon className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Uczestnicy rozmowy</h2>
          </div>
          {meeting.participants.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak zapisanych uczestników.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {meeting.participants.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {person.display_name || "Uczestnik"}
                    </span>
                    {person.email ? (
                      <span className="text-xs text-muted-foreground">{person.email}</span>
                    ) : null}
                  </div>
                  {person.contact_id ? (
                    <Badge variant="secondary">Kontakt w CRM</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sekcja 5: Propozycje zadań z Fathoma */}
      {suggestions.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/70 pb-3">
            <ListChecksIcon className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Propozycje zadań z rozmowy</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {suggestions.map((item, index) => (
              <ActionItemForm
                key={`${item.description}-${index}`}
                title={item.description ?? "Propozycja"}
                description={[item.assignee_name, item.assignee_email, item.timestamp]
                  .filter(Boolean)
                  .join(" · ")}
                accounts={directories.accounts}
                deals={directories.deals}
                members={directories.members}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Sekcja 6: Transkrypcja */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
          <h2 className="text-base font-semibold">Pełna transkrypcja</h2>
          <Badge variant="outline">{meeting.segments.length} wypowiedzi</Badge>
        </div>
        {meeting.segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Transkrypcja dla tego spotkania nie jest jeszcze dostępna.
          </p>
        ) : (
          <MeetingTranscript segments={meeting.segments} />
        )}
      </section>
    </div>
  )

  if (presentation === "sheet") {
    return (
      <MeetingSheet backHref={backHref}>
        <SheetHeader className="shrink-0 border-b border-border bg-card px-6 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg font-semibold">{meeting.title}</SheetTitle>
            <Badge variant="secondary">{meetingSyncText(meeting.sync_status)}</Badge>
            <Badge variant="outline">{meetingMatchText(meeting.matching_state)}</Badge>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3.5 text-primary" />
              {formatDateTime(meeting.started_at)}
            </span>
            {duration ? (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="size-3.5 text-primary" />
                {duration}
              </span>
            ) : null}
            {meeting.recorded_by_email ? <span>{meeting.recorded_by_email}</span> : null}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
      </MeetingSheet>
    )
  }

  return body
}
