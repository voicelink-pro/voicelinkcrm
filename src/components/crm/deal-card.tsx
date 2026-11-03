import Link from "next/link"
import { notFound } from "next/navigation"

import { LeadDialog } from "@/components/crm/lead-dialog"

import {
  EndSubscriptionForm,
  FinalizeForm,
  ReplaceRevenueForm,
  RevertFinalizationForm,
  ReviseSubscriptionForm,
} from "@/components/crm/finance-forms"
import { FinanceLedger, splitThrough } from "@/components/crm/finance-summary"
import { LeadWindowForm } from "@/components/crm/lead-window-form"
import { LinkedDocuments } from "@/components/crm/linked-documents"
import {
  ArchiveForm,
  ContactForm,
  DealEditForm,
  NoteForm,
  OutcomeForm,
  OwnerForm,
  StageForm,
  TaskForm,
} from "@/components/crm/record-forms"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { catchUpAccount, previewSchedule, warsawToday } from "@/lib/crm/finance"
import { suggestFollowUpDue } from "@/lib/crm/follow-up"
import { formatDay, formatDateTime, formatGrosze } from "@/lib/crm/format"
import {
  missing,
  productLabel,
  stageLabel,
} from "@/lib/crm/labels"
import { taskStatusText } from "@/lib/crm/task-query"
import { getDeal, getDealContext, listFinance, listMembers } from "@/lib/crm/queries"

const activityLabels: Record<string, string> = {
  lead_created: "Utworzono leada",
  lead_imported: "Lead z importu",
  stage_changed: "Zmiana etapu",
  contact_outcome: "Wynik kontaktu",
  call_no_answer: "Nie odebrał",
  deal_won: "Wygrana",
  deal_lost: "Przegrana",
}

export async function DealCard({
  dealId,
  backHref,
  presentation = "page",
}: {
  dealId: string
  backHref: string
  presentation?: "page" | "window"
}) {
  const back = backHref
  const { deal, error } = await getDeal(dealId)

  if (error) {
    const alert = (
      <Alert variant="destructive">
        <AlertTitle>Karta niedostępna</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
    return presentation === "window" ? <LeadDialog>{alert}</LeadDialog> : alert
  }

  if (!deal) {
    if (presentation === "window") {
      return (
        <LeadDialog>
          <DialogHeader>
            <DialogTitle>Lead niedostępny</DialogTitle>
            <DialogDescription>Nie ma takiej szansy.</DialogDescription>
          </DialogHeader>
        </LeadDialog>
      )
    }
    notFound()
  }

  if (presentation === "window") {
    return (
      <LeadDialog>
        <div className="flex flex-col gap-4">
          <DialogHeader className="pr-2">
            <DialogTitle className="text-lg">{deal.title}</DialogTitle>
            <DialogDescription className="sr-only">
              Szczegóły leada otwarte nad listą.
            </DialogDescription>
          </DialogHeader>
          <LeadWindowForm
            key={`${deal.id}-${deal.version}`}
            dealId={deal.id}
            version={deal.version}
            title={deal.title}
            productType={deal.product_type}
            description={deal.description}
            primaryContactId={deal.primary_contact_id}
          />
        </div>
      </LeadDialog>
    )
  }

  await catchUpAccount(deal.account_id)
  const [context, members, finance, today, suggestedDue] = await Promise.all([
    getDealContext(deal.id, deal.account_id),
    listMembers(),
    listFinance(deal.account_id),
    warsawToday(),
    suggestFollowUpDue(),
  ])
  const agreements = finance.agreements.filter((item) => item.dealId === deal.id)
  const entries = finance.entries.filter((item) => item.dealId === deal.id)
  const booked = splitThrough(entries, today)
  const reversed = new Set(entries.map((entry) => entry.reversesEntryId).filter(Boolean))
  const correctable = entries.filter(
    (entry) => entry.entryType !== "correction" && !entry.supersededAt && !reversed.has(entry.id),
  )
  const cycleOptions = new Map<string, { index: number; date: string }[]>()
  for (const agreement of agreements) {
    if (agreement.kind !== "subscription" || agreement.status === "void" || agreement.anchorDay == null) {
      continue
    }
    const rows = await previewSchedule(agreement.startsOn, agreement.anchorDay, agreement.endsOn, today)
    cycleOptions.set(
      agreement.id,
      rows
        .filter((row) => row.state === "future" && row.date > agreement.startsOn)
        .map((row) => ({ index: row.index, date: row.date })),
    )
  }
  const names = new Map(members.map((member) => [member.userId, member.fullName]))
  const contacts = context.contacts.filter((contact) => !contact.archived_at)
  const here = `/leads/${deal.id}?returnTo=${encodeURIComponent(back)}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href={back} />}>
            Wróć do listy
          </Button>
          <h1 className="text-2xl font-semibold">{deal.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{stageLabel(deal.stage)}</Badge>
            {deal.archived_at ? <Badge variant="outline">Archiwum</Badge> : null}
          </div>
        </div>
        <ArchiveForm
          entity="deal"
          id={deal.id}
          version={deal.version}
          archived={Boolean(deal.archived_at)}
          returnTo={here}
        />
      </div>

      {context.error ? (
        <Alert variant="destructive">
          <AlertTitle>Część karty się nie wczytała</AlertTitle>
          <AlertDescription>{context.error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <p>Kontakt: {missing(contacts.find((contact) => contact.id === deal.primary_contact_id)?.full_name)}</p>
        <p>
          Firma:{" "}
          {context.account ? (
            <Link className="underline-offset-4 hover:underline" href={`/accounts/${context.account.id}`}>
              {missing(context.account.company_name)}
            </Link>
          ) : (
            "Nie uzupełniono"
          )}
        </p>
        <p>Produkt: {productLabel(deal.product_type)}</p>
        <p>Oferta, opłata jednorazowa: {formatGrosze(deal.setup_amount_gross_cents)}</p>
        <p>Oferta, abonament: {formatGrosze(deal.monthly_amount_gross_cents)}</p>
        <p>Utworzono: {formatDateTime(deal.created_at)}</p>
        {deal.lost_reason ? <p>Powód przegranej: {deal.lost_reason}</p> : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Etap</h2>
          <StageForm dealId={deal.id} version={deal.version} stage={deal.stage} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Opiekun</h2>
          <OwnerForm
            dealId={deal.id}
            version={deal.version}
            ownerUserId={deal.owner_user_id}
            members={members}
          />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Wynik kontaktu</h2>
          <OutcomeForm dealId={deal.id} suggestedDue={suggestedDue} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Dane szansy</h2>
          <DealEditForm
            dealId={deal.id}
            version={deal.version}
            title={deal.title}
            productType={deal.product_type}
            description={deal.description}
            primaryContactId={deal.primary_contact_id}
            contacts={contacts.map((contact) => ({ id: contact.id, fullName: contact.full_name }))}
          />
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Finalizacja</h2>
        {deal.stage === "lost" ? (
          <p className="text-sm text-muted-foreground">Przegrana szansa nie przechodzi przez finalizację.</p>
        ) : null}
        {deal.stage !== "won" && deal.stage !== "lost" && !deal.archived_at ? (
          <FinalizeForm
            dealId={deal.id}
            version={deal.version}
            today={today}
            product={productLabel(deal.product_type)}
            company={missing(context.account?.company_name)}
            contact={missing(contacts.find((item) => item.id === deal.primary_contact_id)?.full_name)}
          />
        ) : null}
        {deal.stage === "won" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Przychód do dziś: {formatGrosze(booked.setup + booked.subscription + booked.correction)}. Opłata
              jednorazowa {formatGrosze(booked.setup)}, abonament {formatGrosze(booked.subscription)}, korekty{" "}
              {formatGrosze(booked.correction)}. Przyszłe cykle nie są w tej sumie. Wartość wdrożenia też nie.
            </p>
            <FinanceLedger entries={entries} agreements={agreements} />
            {agreements
              .filter((item) => item.kind === "subscription" && item.status !== "void")
              .map((agreement) => (
                <div key={agreement.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
                  <EndSubscriptionForm agreementId={agreement.id} version={agreement.version} />
                  <ReviseSubscriptionForm
                    agreementId={agreement.id}
                    version={agreement.version}
                    cycles={cycleOptions.get(agreement.id) ?? []}
                  />
                </div>
              ))}
            <ReplaceRevenueForm
              entries={correctable.map((entry) => ({
                id: entry.id,
                effectiveOn: entry.effectiveOn,
                amountCents: entry.amountCents,
                entryType: entry.entryType,
              }))}
            />
            <RevertFinalizationForm dealId={deal.id} version={deal.version} />
          </div>
        ) : null}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Sekcje karty">
        {["Historia", "Zadania", "Spotkania", "Dokumenty", "Notatki", "Kontakty"].map(
          (label) => (
            <a key={label} className="min-h-11 rounded-lg border px-3 py-2 text-sm" href={`#${label}`}>
              {label}
            </a>
          ),
        )}
      </nav>

      <section id="Historia" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Historia</h2>
        <ul className="flex flex-col gap-3">
          {context.history.map((entry) => (
            <li key={entry.id} className="rounded-xl border bg-card p-3 text-sm">
              {stageLabel(entry.from_stage)} → {stageLabel(entry.to_stage)} ·{" "}
              {formatDateTime(entry.changed_at)} · {missing(names.get(entry.actor_user_id ?? ""))}
            </li>
          ))}
          {context.activities.map((entry) => (
            <li key={entry.id} className="rounded-xl border bg-card p-3 text-sm">
              {activityLabels[entry.activity_type] ?? entry.activity_type}
              {summaryOf(entry.payload) ? ` · ${summaryOf(entry.payload)}` : ""} ·{" "}
              {formatDateTime(entry.occurred_at)} · {missing(names.get(entry.actor_user_id ?? ""))}
            </li>
          ))}
        </ul>
      </section>

      <section id="Zadania" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Zadania</h2>
        <TaskForm accountId={deal.account_id} dealId={deal.id} />
        <ul className="flex flex-col gap-2">
          {context.tasks.length === 0 ? <li className="text-sm text-muted-foreground">Brak zadań.</li> : null}
          {context.tasks.map((task) => (
            <li key={task.id} className="rounded-xl border bg-card p-3 text-sm">
              <Link href={`/tasks/${task.id}`}>{task.title}</Link>
              {" · "}
              {formatDay(task.due_on)} · {taskStatusText(task.status)}
              {task.archived_at ? " · archiwum" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section id="Spotkania" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Spotkania</h2>
        {context.meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak powiązanych spotkań.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {context.meetings.map((meeting) => (
              <li key={meeting.id} className="rounded-xl border bg-card p-3 text-sm">
                <Link href={`/meetings/${meeting.id}`}>
                  {meeting.title} · {formatDateTime(meeting.started_at)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="Dokumenty" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Dokumenty</h2>
        <LinkedDocuments dealId={deal.id} lockedTarget={deal.title} />
      </section>

      <section id="Notatki" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Notatki</h2>
        <NoteForm accountId={deal.account_id} dealId={deal.id} />
        <ul className="flex flex-col gap-2">
          {context.notes.map((note) => (
            <li key={note.id} className="rounded-xl border bg-card p-3 text-sm whitespace-pre-wrap">
              {note.body}
              <span className="mt-2 block text-muted-foreground">{formatDateTime(note.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="Kontakty" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Kontakty</h2>
        <ContactForm accountId={deal.account_id} />
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-xl border bg-card p-4">
            <ContactForm
              accountId={deal.account_id}
              contact={{
                id: contact.id,
                version: contact.version,
                fullName: contact.full_name,
                jobTitle: contact.job_title,
                email: contact.email,
                phone: contact.phone_raw,
                isPrimary: contact.is_primary,
              }}
            />
          </div>
        ))}
      </section>
    </div>
  )
}

function summaryOf(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return ""
  }
  if ("summary" in payload && typeof payload.summary === "string") {
    return payload.summary
  }
  if ("from_stage" in payload && "to_stage" in payload) {
    return `${stageLabel(String(payload.from_stage))} → ${stageLabel(String(payload.to_stage))}`
  }
  return ""
}
