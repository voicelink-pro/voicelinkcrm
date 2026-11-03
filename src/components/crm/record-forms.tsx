"use client"

import { useActionState, useState } from "react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  addContactAction,
  addDealAction,
  addNoteAction,
  addTaskAction,
  archiveAction,
  assignOwnerAction,
  changeStageAction,
  mergeAccountsAction,
  outcomeAction,
  updateAccountAction,
  updateDealAction,
} from "@/lib/crm/actions"
import { formatDay } from "@/lib/crm/format"
import {
  accountKinds,
  dealStages,
  kindLabel,
  missing,
  productTypes,
} from "@/lib/crm/labels"
import type { MemberOption } from "@/lib/crm/queries"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

function PendingLabel({ pending, children }: { pending: boolean; children: string }) {
  return (
    <>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </>
  )
}

export function StageForm({
  dealId,
  version,
  stage,
}: {
  dealId: string
  version: number
  stage: string
}) {
  const [state, action, pending] = useActionState(changeStageAction, initialState)
  const choices = dealStages.filter(([code]) => code !== "won")

  if (stage === "won") {
    return (
      <p className="text-sm text-muted-foreground">
        Ta szansa jest wygrana. Etap zmienia cofnięcie finalizacji.
      </p>
    )
  }

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor="deal-stage">Etap</FieldLabel>
        <select id="deal-stage" name="stage" className={controlClassName} defaultValue={stage}>
          {choices.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field data-invalid={state.fieldErrors?.lostReason ? true : undefined}>
        <FieldLabel htmlFor="lost-reason">Powód przegranej</FieldLabel>
        <Input id="lost-reason" name="lostReason" maxLength={500} />
        {state.fieldErrors?.lostReason ? (
          <FieldError>{state.fieldErrors.lostReason}</FieldError>
        ) : (
          <p className="text-sm text-muted-foreground">Wymagany tylko przy etapie Przegrany.</p>
        )}
      </Field>
      <p className="text-sm text-muted-foreground">
        Wygranie jest osobnym formularzem i nalicza przychód.
      </p>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz etap</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function OwnerForm({
  dealId,
  version,
  ownerUserId,
  members,
}: {
  dealId: string
  version: number
  ownerUserId: string | null
  members: MemberOption[]
}) {
  const [state, action, pending] = useActionState(assignOwnerAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor="deal-owner">Opiekun</FieldLabel>
        <select
          id="deal-owner"
          name="ownerUserId"
          className={controlClassName}
          defaultValue={ownerUserId ?? ""}
        >
          <option value="">Bez opiekuna</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz opiekuna</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function DealEditForm({
  dealId,
  version,
  title,
  productType,
  description,
  primaryContactId,
  contacts,
}: {
  dealId: string
  version: number
  title: string
  productType: string | null
  description: string | null
  primaryContactId: string | null
  contacts: { id: string; fullName: string }[]
}) {
  const [state, action, pending] = useActionState(updateDealAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <FieldGroup>
        <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
          <FieldLabel htmlFor="deal-title">Tytuł</FieldLabel>
          <Input id="deal-title" name="title" required defaultValue={title} />
          {state.fieldErrors?.title ? <FieldError>{state.fieldErrors.title}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="deal-product">Produkt</FieldLabel>
          <select
            id="deal-product"
            name="productType"
            className={controlClassName}
            defaultValue={productType ?? ""}
          >
            <option value="">Nie uzupełniono</option>
            {productTypes.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="deal-contact">Kontakt główny</FieldLabel>
          <select
            id="deal-contact"
            name="primaryContactId"
            className={controlClassName}
            defaultValue={primaryContactId ?? ""}
          >
            <option value="">Nie uzupełniono</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="deal-description">Opis</FieldLabel>
          <textarea
            id="deal-description"
            name="description"
            className={textAreaClassName}
            defaultValue={description ?? ""}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz szansę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function OutcomeForm({
  dealId,
  suggestedDue,
}: {
  dealId: string
  suggestedDue: string | null
}) {
  const [state, action, pending] = useActionState(outcomeAction, initialState)
  const [outcome, setOutcome] = useState("no_answer")
  const [actionKey] = useState(() => crypto.randomUUID())

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="actionKey" value={actionKey} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor="outcome">Wynik kontaktu</FieldLabel>
        <select
          id="outcome"
          name="outcome"
          className={controlClassName}
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          <option value="no_answer">Nie odebrał</option>
          <option value="conversation">Rozmowa</option>
          <option value="other">Inny wynik</option>
        </select>
      </Field>
      {outcome === "no_answer" ? (
        suggestedDue ? (
          <p className="text-sm text-muted-foreground">
            Orientacyjny termin: {formatDay(suggestedDue)}. Faktyczny dzień jest liczony przy
            zapisie. Godzina oddzwonienia nie jest ustalana. Przed 09:00 oraz w sobotę i niedzielę
            data jest wpisywana ręcznie. Święta nie są rozpoznawane.
          </p>
        ) : (
          <Field data-invalid={state.fieldErrors?.dueOn ? true : undefined}>
            <FieldLabel htmlFor="due-on">Termin ponownego kontaktu</FieldLabel>
            <Input id="due-on" name="dueOn" type="date" required />
            {state.fieldErrors?.dueOn ? <FieldError>{state.fieldErrors.dueOn}</FieldError> : null}
            <p className="text-sm text-muted-foreground">
              Ta chwila nie ma wyliczonego terminu. Podaj datę. Dotyczy to czasu przed 09:00 oraz
              soboty i niedzieli. Godzina oddzwonienia nie jest ustalana.
            </p>
          </Field>
        )
      ) : (
        <Field data-invalid={state.fieldErrors?.summary ? true : undefined}>
          <FieldLabel htmlFor="summary">Opis</FieldLabel>
          <textarea id="summary" name="summary" className={textAreaClassName} required />
          {state.fieldErrors?.summary ? <FieldError>{state.fieldErrors.summary}</FieldError> : null}
        </Field>
      )}
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz wynik</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function NoteForm({
  accountId,
  dealId,
}: {
  accountId: string
  dealId?: string
}) {
  const [state, action, pending] = useActionState(addNoteAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="accountId" value={accountId} />
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
      <FormFeedback state={state} />
      <Field data-invalid={state.fieldErrors?.body ? true : undefined}>
        <FieldLabel htmlFor={`note-${dealId ?? accountId}`}>Notatka</FieldLabel>
        <textarea id={`note-${dealId ?? accountId}`} name="body" className={textAreaClassName} required />
        {state.fieldErrors?.body ? <FieldError>{state.fieldErrors.body}</FieldError> : null}
      </Field>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Dodaj notatkę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function TaskForm({
  accountId,
  dealId,
}: {
  accountId: string
  dealId?: string
}) {
  const [state, action, pending] = useActionState(addTaskAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="accountId" value={accountId} />
      {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
      <FormFeedback state={state} />
      <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
        <FieldLabel htmlFor={`task-${dealId ?? accountId}`}>Zadanie</FieldLabel>
        <Input id={`task-${dealId ?? accountId}`} name="title" required />
        {state.fieldErrors?.title ? <FieldError>{state.fieldErrors.title}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={`task-due-${dealId ?? accountId}`}>Termin</FieldLabel>
        <Input id={`task-due-${dealId ?? accountId}`} name="dueOn" type="date" />
      </Field>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Dodaj zadanie</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function ContactForm({
  accountId,
  contact,
}: {
  accountId: string
  contact?: {
    id: string
    version: number
    fullName: string
    jobTitle: string | null
    email: string | null
    phone: string | null
    isPrimary: boolean
  }
}) {
  const [state, action, pending] = useActionState(addContactAction, initialState)
  const formId = contact?.id ?? "new"

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="accountId" value={accountId} />
      {contact ? (
        <>
          <input type="hidden" name="contactId" value={contact.id} />
          <input type="hidden" name="version" value={contact.version} />
        </>
      ) : null}
      <FormFeedback state={state} />
      <FieldGroup>
        <Field data-invalid={state.fieldErrors?.fullName ? true : undefined}>
          <FieldLabel htmlFor={`contact-name-${formId}`}>Imię i nazwisko</FieldLabel>
          <Input
            id={`contact-name-${formId}`}
            name="fullName"
            required
            defaultValue={contact?.fullName}
          />
          {state.fieldErrors?.fullName ? <FieldError>{state.fieldErrors.fullName}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`contact-role-${formId}`}>Stanowisko</FieldLabel>
          <Input id={`contact-role-${formId}`} name="jobTitle" defaultValue={contact?.jobTitle ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`contact-email-${formId}`}>E-mail</FieldLabel>
          <Input
            id={`contact-email-${formId}`}
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`contact-phone-${formId}`}>Telefon</FieldLabel>
          <Input
            id={`contact-phone-${formId}`}
            name="phone"
            type="tel"
            defaultValue={contact?.phone ?? ""}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="isPrimary" value="1" defaultChecked={contact?.isPrimary} />
          Kontakt główny
        </label>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          <PendingLabel pending={pending}>{contact ? "Zapisz kontakt" : "Dodaj kontakt"}</PendingLabel>
        </Button>
        {state.duplicate ? (
          <Button type="submit" name="confirmDuplicate" value="1" variant="outline" disabled={pending}>
            Zapisz mimo podobnego kontaktu
          </Button>
        ) : null}
      </div>
    </ActionForm>
  )
}

export function ExtraDealForm({
  accountId,
  contacts,
  members,
}: {
  accountId: string
  contacts: { id: string; fullName: string }[]
  members: MemberOption[]
}) {
  const [state, action, pending] = useActionState(addDealAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <FormFeedback state={state} />
      <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
        <FieldLabel htmlFor="extra-deal-title">Tytuł kolejnej szansy</FieldLabel>
        <Input id="extra-deal-title" name="title" required />
        {state.fieldErrors?.title ? <FieldError>{state.fieldErrors.title}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="extra-deal-product">Produkt</FieldLabel>
        <select id="extra-deal-product" name="productType" className={controlClassName} defaultValue="">
          <option value="">Nie uzupełniono</option>
          {productTypes.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="extra-deal-contact">Kontakt</FieldLabel>
        <select id="extra-deal-contact" name="primaryContactId" className={controlClassName} defaultValue="">
          <option value="">Nie uzupełniono</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="extra-deal-owner">Opiekun</FieldLabel>
        <select id="extra-deal-owner" name="ownerUserId" className={controlClassName} defaultValue="">
          <option value="">Bez opiekuna</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Dodaj szansę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function AccountForm({
  account,
}: {
  account: {
    id: string
    version: number
    displayName: string
    companyName: string | null
    kind: string
    website: string | null
    nip: string | null
    address: string | null
    serviceStatus: string
  }
}) {
  const [state, action, pending] = useActionState(updateAccountAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="accountId" value={account.id} />
      <input type="hidden" name="version" value={account.version} />
      <FormFeedback state={state} />
      <FieldGroup>
        <Field data-invalid={state.fieldErrors?.displayName ? true : undefined}>
          <FieldLabel htmlFor="account-name">Nazwa</FieldLabel>
          <Input id="account-name" name="displayName" required defaultValue={account.displayName} />
          {state.fieldErrors?.displayName ? (
            <FieldError>{state.fieldErrors.displayName}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="account-company">Firma</FieldLabel>
          <Input id="account-company" name="companyName" defaultValue={account.companyName ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-kind">Rodzaj</FieldLabel>
          <select id="account-kind" name="kind" className={controlClassName} defaultValue={account.kind}>
            {accountKinds.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="account-website">Strona</FieldLabel>
          <Input id="account-website" name="website" defaultValue={account.website ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-nip">NIP</FieldLabel>
          <Input id="account-nip" name="nip" defaultValue={account.nip ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-address">Adres</FieldLabel>
          <textarea
            id="account-address"
            name="address"
            className={textAreaClassName}
            defaultValue={account.address ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-service">Status obsługi</FieldLabel>
          <select
            id="account-service"
            name="serviceStatus"
            className={controlClassName}
            defaultValue={account.serviceStatus}
          >
            <option value="active">Aktywny</option>
            <option value="inactive">Nieaktywny</option>
          </select>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz kartę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function MergeForm({
  source,
  targets,
}: {
  source: {
    id: string
    version: number
    displayName: string
    companyName: string | null
    kind: string
  }
  targets: {
    id: string
    version: number
    displayName: string
    companyName: string | null
    kind: string
    relationship: string
  }[]
}) {
  const [state, action, pending] = useActionState(mergeAccountsAction, initialState)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "")
  const target = targets.find((item) => item.id === targetId) ?? targets[0]

  if (!target) {
    return null
  }

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="sourceVersion" value={source.version} />
      <input type="hidden" name="targetId" value={target.id} />
      <input type="hidden" name="targetVersion" value={target.version} />
      <FormFeedback state={state} />
      <p className="text-sm">
        Źródło: {source.displayName}. Relacje przejdą na cel. Przychód nie będzie doliczony drugi raz.
      </p>
      <Field>
        <FieldLabel htmlFor="merge-target">Cel scalenia</FieldLabel>
        <select
          id="merge-target"
          className={controlClassName}
          value={target.id}
          onChange={(event) => setTargetId(event.target.value)}
        >
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName}
              {item.relationship === "client" ? " · klient" : " · prospekt"}
            </option>
          ))}
        </select>
      </Field>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Nazwa</dt>
          <dd>
            {source.displayName} / {target.displayName}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Firma</dt>
          <dd>
            {missing(source.companyName)} / {missing(target.companyName)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rodzaj</dt>
          <dd>
            {kindLabel(source.kind)} / {kindLabel(target.kind)}
          </dd>
        </div>
      </dl>
      <Choice name="keepDisplayFrom" label="Zostaw nazwę" />
      <Choice name="keepCompanyFrom" label="Zostaw firmę" />
      <Choice name="keepKindFrom" label="Zostaw rodzaj" />
      <Button type="submit" disabled={pending}>
        <PendingLabel pending={pending}>Scal ręcznie</PendingLabel>
      </Button>
    </ActionForm>
  )
}

function Choice({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name={name} value="source" />
        Ze źródła
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name={name} value="target" defaultChecked />
        Z celu
      </label>
    </fieldset>
  )
}

export function ArchiveForm({
  entity,
  id,
  version,
  archived,
  returnTo,
}: {
  entity: "account" | "deal" | "contact"
  id: string
  version: number
  archived: boolean
  returnTo: string
}) {
  const [state, action, pending] = useActionState(archiveAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
    >
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormFeedback state={state} />
      <Button type="submit" variant="outline" disabled={pending}>
        <PendingLabel pending={pending}>{archived ? "Przywróć" : "Archiwizuj"}</PendingLabel>
      </Button>
    </ActionForm>
  )
}
