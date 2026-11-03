import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarIcon,
  CheckSquareIcon,
  FileTextIcon,
  UsersIcon,
  VideoIcon,
  WalletIcon,
} from "lucide-react"

import { ClientDossierAccordion } from "@/components/crm/client-dossier"
import { DocumentUpload } from "@/components/crm/document-upload"
import { FinanceLedger, splitThrough } from "@/components/crm/finance-summary"
import { LinkedDocuments } from "@/components/crm/linked-documents"
import {
  AccountForm,
  ArchiveForm,
  ContactForm,
  ExtraDealForm,
  MergeForm,
  TaskForm,
} from "@/components/crm/record-forms"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDocumentPolicy, listLinkedDocuments } from "@/lib/crm/document-read"
import { catchUpAccount, warsawToday } from "@/lib/crm/finance"
import { formatDay, formatDateTime, formatGrosze } from "@/lib/crm/format"
import {
  kindLabel,
  productLabel,
  stageLabel,
} from "@/lib/crm/labels"
import { getAccount, getAccountContext, listFinance, listMembers } from "@/lib/crm/queries"
import { taskStatusText } from "@/lib/crm/task-query"

export const metadata: Metadata = {
  title: "Karta klienta",
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const { account, error } = await getAccount(accountId)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Karta niedostępna</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!account) {
    notFound()
  }

  await catchUpAccount(account.id)
  const [context, members, finance, today, docPolicy, linkedDocs] = await Promise.all([
    getAccountContext(account.id),
    listMembers(),
    listFinance(account.id),
    warsawToday(),
    getDocumentPolicy(),
    listLinkedDocuments({ accountId: account.id }),
  ])

  const here = `/accounts/${account.id}`
  const memberNames = new Map(members.map((m) => [m.userId, m.fullName]))
  const booked = splitThrough(finance.entries, today)

  const wonDeals = context.deals.filter((d) => d.stage === "won" && !d.archived_at)
  const activeDeals = context.deals.filter((d) => !d.archived_at)
  const setupTotal = (wonDeals.length ? wonDeals : activeDeals).reduce(
    (sum, item) => sum + (item.setup_amount_gross_cents ?? 0),
    0,
  )
  const monthlyTotal = (wonDeals.length ? wonDeals : activeDeals).reduce(
    (sum, item) => sum + (item.monthly_amount_gross_cents ?? 0),
    0,
  )

  const primaryDeal = wonDeals[0] ?? activeDeals[0] ?? null

  const deploymentSummary = primaryDeal?.product_type
    ? `${productLabel(primaryDeal.product_type)} (${primaryDeal.title})`
    : primaryDeal?.title ?? "Wdrożenie indywidualne"

  const creatorId =
    account.created_by ??
    primaryDeal?.created_by ??
    primaryDeal?.owner_user_id ??
    null
  const creatorName = creatorId ? (memberNames.get(creatorId) ?? "Członek zespołu") : "Nie uzupełniono"

  const ownerId = primaryDeal?.owner_user_id ?? null
  const ownerName = (ownerId ? memberNames.get(ownerId) : null) ?? creatorName

  const primaryContact = context.contacts.find((c) => c.is_primary && !c.archived_at) ?? context.contacts[0]
  const accountRecord = account as typeof account & {
    implementation_stage?: string | null
    implementation_due_on?: string | null
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Nagłówek karty klienta */}
      <div className="flex flex-col gap-3">
        <div>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/clients" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            Wróć do klientów
          </Button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Building2Icon className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{account.display_name}</h1>
                <p className="text-xs text-muted-foreground">
                  {primaryContact
                    ? `Kontakt: ${primaryContact.full_name}${primaryContact.phone_raw ? ` · ${primaryContact.phone_raw}` : ""}${primaryContact.email ? ` · ${primaryContact.email}` : ""}`
                    : "Brak przypisanego głównego kontaktu"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="secondary">
                {account.relationship === "client" ? "Klient" : "Prospekt"}
              </Badge>
              <Badge variant="outline">{kindLabel(account.kind)}</Badge>
              <Badge
                variant="outline"
                className={
                  account.service_status === "inactive"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }
              >
                {account.service_status === "inactive" ? "Nieaktywny" : "Aktywna obsługa"}
              </Badge>
              {account.nip ? <Badge variant="outline">NIP: {account.nip}</Badge> : null}
              {account.archived_at ? <Badge variant="destructive">Archiwum</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ArchiveForm
              entity="account"
              id={account.id}
              version={account.version}
              archived={Boolean(account.archived_at)}
              returnTo={here}
            />
          </div>
        </div>
      </div>

      {context.error ? (
        <Alert variant="destructive">
          <AlertTitle>Część karty się nie wczytała</AlertTitle>
          <AlertDescription>{context.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Główne rozwijane wiersze z kolorowymi kropkami */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Kartoteka wdrożeniowa klienta
          </h2>
          <span className="text-xs text-muted-foreground">
            Kliknij wybrany wiersz, aby rozwinąć szczegóły i notatki
          </span>
        </div>

        <ClientDossierAccordion
          account={{
            id: account.id,
            displayName: account.display_name,
            implementationStage: accountRecord.implementation_stage ?? "in_progress",
            implementationDueOn: accountRecord.implementation_due_on ?? null,
            implementationNotes: account.implementation_notes,
            integrationSystems: account.integration_systems,
            integrationDocsStatus: account.integration_docs_status ?? "missing",
            integrationNotes: account.integration_notes,
          }}
          generalInfo={{
            totalBookedCents: booked.setup + booked.subscription + booked.correction,
            setupCents: setupTotal,
            monthlyCents: monthlyTotal,
            deploymentSummary,
            dueOn: accountRecord.implementation_due_on ?? null,
            creatorName,
            ownerName,
          }}
          notes={context.notes.map((n) => ({
            id: n.id,
            body: n.body,
            createdAt: n.created_at,
            authorName: n.created_by ? (memberNames.get(n.created_by) ?? "Zespół") : "Zespół",
          }))}
          documents={linkedDocs.rows}
          uploadSlot={
            docPolicy.maxBytes && docPolicy.mimeTypes.length ? (
              <DocumentUpload
                maxBytes={docPolicy.maxBytes}
                mimeTypes={docPolicy.mimeTypes}
                target={{ accountId: account.id }}
                lockedTarget={account.display_name}
                triggerLabel="Dodaj dokument / specyfikację"
                triggerVariant="outline"
                triggerSize="sm"
              />
            ) : null
          }
        />
      </section>

      {/* Pozostałe sekcje CRM w czystym układzie kart */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <CheckSquareIcon className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Zadania klienta</h2>
            </div>
            <Badge variant="outline">{context.tasks.length}</Badge>
          </div>
          <TaskForm accountId={account.id} />
          {context.tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak zadań przypisanych do tego klienta.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {context.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                >
                  <Link href={`/tasks/${task.id}`} className="font-medium hover:text-primary hover:underline">
                    {task.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDay(task.due_on)} · {taskStatusText(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <VideoIcon className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Spotkania i nagrania</h2>
            </div>
            <Badge variant="outline">{context.meetings.length}</Badge>
          </div>
          {context.meetings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak powiązanych spotkań z Fathom.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {context.meetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                >
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {meeting.title}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarIcon className="size-3" />
                    {formatDateTime(meeting.started_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-col gap-3 border-t border-border/70 pt-4">
            <div className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Wszystkie dokumenty klienta</h3>
            </div>
            <LinkedDocuments accountId={account.id} lockedTarget={account.display_name} />
          </div>
        </section>
      </div>

      {/* Dodatkowe dane rejestrowe, kontakty, szanse i rozliczenia w zwijanych blokach */}
      <details className="group rounded-2xl border border-border bg-card shadow-2xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-foreground hover:bg-muted/40">
          <div className="flex items-center gap-2.5">
            <UsersIcon className="size-4 text-primary" />
            <span>Dane firmy, kontakty ({context.contacts.length}) i szanse ({context.deals.length})</span>
          </div>
          <Badge variant="outline">Rozwiń edycję danych</Badge>
        </summary>
        <div className="grid gap-6 border-t border-border/70 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Dane rejestrowe firmy</h3>
            <AccountForm
              account={{
                id: account.id,
                version: account.version,
                displayName: account.display_name,
                companyName: account.company_name,
                kind: account.kind,
                website: account.website,
                nip: account.nip,
                address: account.address,
                serviceStatus: account.service_status,
              }}
            />
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Kontakty</h3>
            <ContactForm accountId={account.id} />
            {context.contacts.map((contact) => (
              <div key={contact.id} className="rounded-xl border bg-muted/20 p-4">
                {contact.archived_at ? <p className="mb-2 text-xs text-muted-foreground">Archiwum</p> : null}
                <ContactForm
                  accountId={account.id}
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
          </div>

          <div className="flex flex-col gap-3 lg:col-span-2 border-t border-border/70 pt-4">
            <h3 className="text-base font-semibold">Szanse sprzedażowe</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {context.deals.map((deal) => (
                <li key={deal.id} className="flex flex-wrap items-center justify-between rounded-lg border px-3 py-2">
                  <Link
                    className="font-medium underline-offset-4 hover:text-primary hover:underline"
                    href={`/leads/${deal.id}?returnTo=${encodeURIComponent(here)}`}
                  >
                    {deal.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {stageLabel(deal.stage)} · {productLabel(deal.product_type)} · jednorazowo{" "}
                    {formatGrosze(deal.setup_amount_gross_cents)}, abonament{" "}
                    {formatGrosze(deal.monthly_amount_gross_cents)}
                    {deal.archived_at ? " · archiwum" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <ExtraDealForm
              accountId={account.id}
              members={members}
              contacts={context.contacts
                .filter((contact) => !contact.archived_at)
                .map((contact) => ({ id: contact.id, fullName: contact.full_name }))}
            />
          </div>
        </div>
      </details>

      <details className="group rounded-2xl border border-border bg-card shadow-2xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-foreground hover:bg-muted/40">
          <div className="flex items-center gap-2.5">
            <WalletIcon className="size-4 text-primary" />
            <span>Harmonogram i historia przychodów ({formatGrosze(booked.setup + booked.subscription + booked.correction)})</span>
          </div>
          <Badge variant="outline">Pokaż rozliczenia</Badge>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border/70 p-5">
          <p className="text-sm text-muted-foreground">
            Przychód zaksięgowany do dziś: {formatGrosze(booked.setup + booked.subscription + booked.correction)}. Opłata
            jednorazowa {formatGrosze(booked.setup)}, abonament {formatGrosze(booked.subscription)}, korekty{" "}
            {formatGrosze(booked.correction)}.
          </p>
          <FinanceLedger entries={finance.entries} agreements={finance.agreements} />
        </div>
      </details>

      {context.duplicates.length ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Możliwy duplikat</h2>
          <p className="text-sm text-muted-foreground">
            Ten sam e-mail albo telefon występuje też w innej karcie. Scalenie jest ręczne.
          </p>
          <MergeForm
            source={{
              id: account.id,
              version: account.version,
              displayName: account.display_name,
              companyName: account.company_name,
              kind: account.kind,
            }}
            targets={context.duplicates}
          />
        </section>
      ) : null}
    </div>
  )
}
