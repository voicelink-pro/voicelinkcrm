"use client"

import Link from "next/link"
import { useActionState, useState, type ReactNode } from "react"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  LayersIcon,
  MessageSquarePlusIcon,
  PlugZapIcon,
  SaveIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react"
import { cn } from "cn"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { addNoteAction, saveAccountDossierAction } from "@/lib/crm/actions"
import {
  documentCategoryStyle,
  documentCategoryText,
  documentStatusText,
} from "@/lib/crm/document-query"
import { formatDateTime, formatDay, formatGrosze } from "@/lib/crm/format"
import { implementationStageLabel, implementationStages } from "@/lib/crm/labels"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

type NoteItem = {
  id: string
  body: string
  createdAt: string
  authorName: string
}

type DocumentItem = {
  id: string
  originalName: string
  category: string
  status: string
}

const docsStatusOptions = [
  {
    code: "missing",
    label: "Brak dokumentacji",
    badge: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  {
    code: "partial",
    label: "W trakcie zbierania",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  {
    code: "complete",
    label: "Mamy kompletną dokumentację",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
] as const

export function ClientDossierAccordion({
  account,
  generalInfo,
  notes,
  documents,
  uploadSlot,
}: {
  account: {
    id: string
    displayName: string
    implementationStage: string
    implementationDueOn: string | null
    implementationNotes: string | null
    integrationSystems: string | null
    integrationDocsStatus: string
    integrationNotes: string | null
  }
  generalInfo: {
    totalBookedCents: number
    setupCents: number
    monthlyCents: number
    deploymentSummary: string
    dueOn: string | null
    creatorName: string
    ownerName: string
  }
  notes: NoteItem[]
  documents: DocumentItem[]
  uploadSlot?: ReactNode
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    general: true,
    deployment: false,
    integration: false,
  })

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const currentDocsStatus =
    docsStatusOptions.find((opt) => opt.code === account.integrationDocsStatus) ??
    docsStatusOptions[0]
  const integrationDocs = documents.filter((doc) => doc.category === "integration")

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs divide-y divide-border">
      {/* Wiersz 1: Informacje Ogólne (Niebieska kropka) */}
      <div>
        <button
          type="button"
          aria-expanded={openSections.general}
          onClick={() => toggleSection("general")}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="size-3 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-500/15" />
            <div className="flex min-w-0 flex-col">
              <span className="text-base font-semibold text-foreground">
                Informacje Ogólne
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Kwota, co to za wdrożenie, termin realizacji, osoba tworząca
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <Badge
              variant="outline"
              className="hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex"
            >
              {generalInfo.deploymentSummary}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              {formatGrosze(generalInfo.setupCents || generalInfo.totalBookedCents)}
            </Badge>
            <ChevronDownIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                openSections.general && "rotate-180",
              )}
            />
          </div>
        </button>

        {openSections.general ? (
          <div className="border-t border-border/70 bg-muted/20 p-5">
            <div className="flex flex-col gap-5">
              {/* 4 główne karty informacyjne */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <WalletIcon className="size-3.5 text-blue-600" />
                    Kwota (wdrożenie / abonament)
                  </span>
                  <span className="text-base font-semibold text-foreground tabular-nums">
                    {formatGrosze(generalInfo.setupCents)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Abonament: {formatGrosze(generalInfo.monthlyCents)} · Przychód do dziś:{" "}
                    {formatGrosze(generalInfo.totalBookedCents)}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <LayersIcon className="size-3.5 text-blue-600" />
                    Co to za wdrożenie
                  </span>
                  <span className="text-base font-semibold text-foreground">
                    {generalInfo.deploymentSummary}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Zakres realizowany dla klienta
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                  <span className="text-xs font-medium text-muted-foreground">
                    Termin wdrożenia
                  </span>
                  <span className="text-base font-semibold text-foreground">
                    {generalInfo.dueOn ? formatDay(generalInfo.dueOn) : "Brak ustalonego terminu"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Etap: {implementationStageLabel(account.implementationStage)}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <UserIcon className="size-3.5 text-blue-600" />
                    Osoba tworząca / Opiekun
                  </span>
                  <span className="text-base font-semibold text-foreground">
                    {generalInfo.creatorName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Opiekun: {generalInfo.ownerName}
                  </span>
                </div>
              </div>

              {/* Miejsce do pisania notatek ogólnych */}
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <QuickAccountNoteForm
                  accountId={account.id}
                  label="Notatka ogólna do klienta"
                  placeholder="Wpisz ważne ustalenia ogólne, warunki handlowe, terminy lub uwagi o kliencie..."
                />

                <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ostatnie notatki na karcie ({notes.length})
                    </span>
                  </div>
                  {notes.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Brak zapisanych notatek dla tego klienta.
                    </p>
                  ) : (
                    <ul className="flex max-h-44 flex-col gap-2 overflow-y-auto pr-1">
                      {notes.slice(0, 5).map((note) => (
                        <li
                          key={note.id}
                          className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs"
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{note.authorName}</span>
                            <span>{formatDateTime(note.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-foreground/90">{note.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Wiersz 2: Stan wdrożenia (Bursztynowa kropka) */}
      <div>
        <button
          type="button"
          aria-expanded={openSections.deployment}
          onClick={() => toggleSection("deployment")}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="size-3 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-500/15" />
            <div className="flex min-w-0 flex-col">
              <span className="text-base font-semibold text-foreground">
                Stan wdrożenia
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Jaki etap, na czym stoimy, bieżące postępy i notatki wdrożeniowe
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-800"
            >
              Etap: {implementationStageLabel(account.implementationStage)}
            </Badge>
            <ChevronDownIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                openSections.deployment && "rotate-180",
              )}
            />
          </div>
        </button>

        {openSections.deployment ? (
          <div className="border-t border-border/70 bg-muted/20 p-5">
            <ImplementationNotesForm
              accountId={account.id}
              defaultStage={account.implementationStage}
              defaultDueOn={account.implementationDueOn ?? ""}
              defaultNotes={account.implementationNotes ?? ""}
            />
          </div>
        ) : null}
      </div>

      {/* Wiersz 3: Integracje (Szmaragdowa kropka) */}
      <div>
        <button
          type="button"
          aria-expanded={openSections.integration}
          onClick={() => toggleSection("integration")}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="size-3 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
            <div className="flex min-w-0 flex-col">
              <span className="text-base font-semibold text-foreground">
                Integracje
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Jakie systemy zewnętrzne, czy mamy dokumentację API, klucze i notatki techniczne
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {account.integrationSystems ? (
              <Badge variant="secondary" className="hidden max-w-48 truncate sm:inline-flex">
                {account.integrationSystems}
              </Badge>
            ) : null}
            <Badge variant="outline" className={cn("gap-1.5", currentDocsStatus.badge)}>
              <span className={cn("size-1.5 rounded-full", currentDocsStatus.dot)} />
              {currentDocsStatus.label}
            </Badge>
            <ChevronDownIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                openSections.integration && "rotate-180",
              )}
            />
          </div>
        </button>

        {openSections.integration ? (
          <div className="border-t border-border/70 bg-muted/20 p-5">
            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <IntegrationDossierForm
                accountId={account.id}
                defaultSystems={account.integrationSystems ?? ""}
                defaultDocsStatus={account.integrationDocsStatus}
                defaultNotes={account.integrationNotes ?? ""}
              />

              <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Dokumenty i specyfikacje ({documents.length})
                      </h3>
                    </div>
                    {integrationDocs.length > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-800"
                      >
                        Integracja: {integrationDocs.length}
                      </Badge>
                    ) : null}
                  </div>

                  {documents.length === 0 ? (
                    <p className="py-4 text-xs text-muted-foreground">
                      Brak wgranych dokumentów dla tego klienta. Możesz od razu dodać dokumentację integracji lub umowę poniżej.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-sm">
                      {documents.map((doc) => {
                        const catStyle = documentCategoryStyle(doc.category)
                        return (
                          <li
                            key={doc.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
                          >
                            <Link
                              href={`/documents/${doc.id}`}
                              className="truncate text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                              {doc.originalName}
                            </Link>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={cn("gap-1", catStyle.badge)}>
                                <span className={cn("size-1.5 rounded-full", catStyle.dot)} />
                                {documentCategoryText(doc.category)}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {documentStatusText(doc.status)}
                              </span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {uploadSlot ? <div className="border-t border-border/60 pt-3">{uploadSlot}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ImplementationNotesForm({
  accountId,
  defaultStage,
  defaultDueOn,
  defaultNotes,
}: {
  accountId: string
  defaultStage: string
  defaultDueOn: string
  defaultNotes: string
}) {
  const [state, action, pending] = useActionState(saveAccountDossierAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error)}
      className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="section" value="implementation" />
      <FormFeedback state={state} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`impl-stage-${accountId}`}>Aktualny etap wdrożenia</FieldLabel>
          <select
            id={`impl-stage-${accountId}`}
            name="implementationStage"
            defaultValue={defaultStage || "in_progress"}
            className={controlClassName}
          >
            {implementationStages.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`impl-due-${accountId}`}>Planowany termin zakończenia</FieldLabel>
          <Input
            id={`impl-due-${accountId}`}
            name="implementationDueOn"
            type="date"
            defaultValue={defaultDueOn}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`impl-notes-${accountId}`}>
          Na czym stoimy — opis etapu i notatki wdrożeniowe
        </FieldLabel>
        <FieldDescription className="text-xs">
          Zapisz aktualny status prac, blokery, na co czekamy od klienta oraz kolejne kroki.
        </FieldDescription>
        <textarea
          id={`impl-notes-${accountId}`}
          name="implementationNotes"
          defaultValue={defaultNotes}
          placeholder="Np. Czekamy na nagrania powitań od klienta, scenariusz rozmowy zaakceptowany, testy zaplanowane na czwartek..."
          className={textAreaClassName}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Zapisywanie...
            </>
          ) : (
            <>
              <SaveIcon data-icon="inline-start" />
              Zapisz stan wdrożenia
            </>
          )}
        </Button>
      </div>
    </ActionForm>
  )
}

function IntegrationDossierForm({
  accountId,
  defaultSystems,
  defaultDocsStatus,
  defaultNotes,
}: {
  accountId: string
  defaultSystems: string
  defaultDocsStatus: string
  defaultNotes: string
}) {
  const [state, action, pending] = useActionState(saveAccountDossierAction, initialState)
  const [docsStatus, setDocsStatus] = useState(defaultDocsStatus || "missing")

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error)}
      className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="section" value="integration" />
      <input type="hidden" name="integrationDocsStatus" value={docsStatus} />
      <FormFeedback state={state} />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`int-systems-${accountId}`}>
            <PlugZapIcon className="size-4 text-emerald-600" />
            Jakie systemy integrujemy
          </FieldLabel>
          <Input
            id={`int-systems-${accountId}`}
            name="integrationSystems"
            defaultValue={defaultSystems}
            placeholder="Np. Proassist, ZnanyLekarz, Google Calendar, HubSpot, własne REST API..."
          />
        </Field>

        <Field>
          <FieldLabel>Czy mamy już dokumentację / dostępy?</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Status dokumentacji integracji">
            {docsStatusOptions.map((option) => {
              const selected = docsStatus === option.code
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDocsStatus(option.code)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? cn(option.badge, "ring-2 ring-current/15 shadow-2xs")
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", option.dot)} />
                  <span className="line-clamp-1">{option.label}</span>
                </button>
              )
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor={`int-notes-${accountId}`}>
            Notatki techniczne i ustalenia dotyczące integracji
          </FieldLabel>
          <textarea
            id={`int-notes-${accountId}`}
            name="integrationNotes"
            defaultValue={defaultNotes}
            placeholder="Opisz endpointy, sposób autoryzacji, brakujące dokumenty od dostawcy oprogramowania, limity API..."
            className={textAreaClassName}
          />
        </Field>
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Zapisywanie...
            </>
          ) : (
            <>
              <CheckCircle2Icon data-icon="inline-start" />
              Zapisz integracje
            </>
          )}
        </Button>
      </div>
    </ActionForm>
  )
}

function QuickAccountNoteForm({
  accountId,
  label,
  placeholder,
}: {
  accountId: string
  label: string
  placeholder: string
}) {
  const [state, action, pending] = useActionState(addNoteAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors)}
      className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor={`quick-note-${accountId}`}>
          <MessageSquarePlusIcon className="size-4 text-blue-600" />
          {label}
        </FieldLabel>
        <textarea
          id={`quick-note-${accountId}`}
          name="body"
          required
          placeholder={placeholder}
          className={cn(textAreaClassName, "min-h-24")}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Dodaj notatkę
        </Button>
      </div>
    </ActionForm>
  )
}
