"use client"

import { useActionState, useEffect, useState } from "react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  endSubscriptionAction,
  finalizeDealAction,
  loadSchedulePreview,
  replaceRevenueAction,
  revertFinalizationAction,
  reviseSubscriptionAction,
} from "@/lib/crm/finance-actions"
import type { ScheduleRow } from "@/lib/crm/finance-types"
import { formatDay, formatGrosze } from "@/lib/crm/format"
import { dealStages } from "@/lib/crm/labels"
import { parseGrosze } from "@/lib/crm/money"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

const stateLabel: Record<ScheduleRow["state"], string> = {
  due: "zostanie naliczone przy zapisie",
  future: "nie wchodzi do przychodu dzisiaj",
  excluded: "nie zostanie naliczone",
}

function PendingLabel({ pending, children }: { pending: boolean; children: string }) {
  return (
    <>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </>
  )
}

export function FinalizeForm({
  dealId,
  version,
  today,
  product,
  company,
  contact,
}: {
  dealId: string
  version: number
  today: string
  product: string
  company: string
  contact: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(finalizeDealAction, initialState)
  const [setupOn, setSetupOn] = useState(today)
  const [monthly, setMonthly] = useState("")
  const [startsOn, setStartsOn] = useState("")
  const [endsOn, setEndsOn] = useState("")
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const monthlyCents = parseGrosze(monthly)

  useEffect(() => {
    if (!open || monthlyCents == null || monthlyCents === 0 || !startsOn) {
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void loadSchedulePreview(startsOn, endsOn).then((preview) => {
        if (!cancelled) setRows(preview.rows)
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, monthlyCents, startsOn, endsOn])

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Oznacz jako wygrany
      </Button>
    )
  }

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <div className="text-sm">
        <p>Produkt: {product}</p>
        <p>Firma: {company}</p>
        <p>Kontakt: {contact}</p>
      </div>
      <Field data-invalid={state.fieldErrors?.setupAmount ? true : undefined}>
        <FieldLabel htmlFor="setup-amount">Opłata jednorazowa brutto</FieldLabel>
        <Input id="setup-amount" name="setupAmount" inputMode="decimal" placeholder="0,00" />
        {state.fieldErrors?.setupAmount ? <FieldError>{state.fieldErrors.setupAmount}</FieldError> : null}
        <p className="text-sm text-muted-foreground">Wpisz 0, jeśli opłaty jednorazowej nie ma.</p>
      </Field>
      <Field data-invalid={state.fieldErrors?.monthlyAmount ? true : undefined}>
        <FieldLabel htmlFor="monthly-amount">Miesięczny abonament brutto</FieldLabel>
        <Input
          id="monthly-amount"
          name="monthlyAmount"
          inputMode="decimal"
          placeholder="0,00"
          value={monthly}
          onChange={(event) => setMonthly(event.target.value)}
        />
        {state.fieldErrors?.monthlyAmount ? (
          <FieldError>{state.fieldErrors.monthlyAmount}</FieldError>
        ) : null}
        <p className="text-sm text-muted-foreground">Wpisz 0, jeśli abonamentu nie ma.</p>
      </Field>
      <Field>
        <FieldLabel htmlFor="setup-on">Data naliczenia jednorazowego</FieldLabel>
        <Input
          id="setup-on"
          name="setupOn"
          type="date"
          value={setupOn}
          onChange={(event) => setSetupOn(event.target.value)}
        />
      </Field>
      <Field data-invalid={state.fieldErrors?.subscriptionStartsOn ? true : undefined}>
        <FieldLabel htmlFor="subscription-starts">Data rozpoczęcia abonamentu</FieldLabel>
        <Input
          id="subscription-starts"
          name="subscriptionStartsOn"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
        />
        {state.fieldErrors?.subscriptionStartsOn ? (
          <FieldError>{state.fieldErrors.subscriptionStartsOn}</FieldError>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Obowiązkowa, gdy abonament jest większy od zera. Nie jest liczona z terminu wdrożenia.
        </p>
      </Field>
      <Field data-invalid={state.fieldErrors?.subscriptionEndsOn ? true : undefined}>
        <FieldLabel htmlFor="subscription-ends">Zakończenie abonamentu</FieldLabel>
        <Input
          id="subscription-ends"
          name="subscriptionEndsOn"
          type="date"
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
        />
        {state.fieldErrors?.subscriptionEndsOn ? (
          <FieldError>{state.fieldErrors.subscriptionEndsOn}</FieldError>
        ) : null}
        <p className="text-sm text-muted-foreground">Od tego dnia nie naliczaj kolejnych opłat.</p>
      </Field>
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">Podgląd harmonogramu</p>
        <p className="text-muted-foreground">
          W krótszym miesiącu termin to wcześniejszy z dnia rozpoczęcia i ostatniego dnia miesiąca.
          Kolejny cykl liczy się od pierwszej daty, nie od skróconego miesiąca. Pełna kwota miesięczna,
          bez proporcji.
        </p>
        {monthlyCents === 0 ? <p>Abonament wynosi 0. Harmonogram nie powstaje.</p> : null}
        {monthlyCents != null && monthlyCents > 0 && rows.length === 0 ? (
          <p>Podaj datę rozpoczęcia, żeby zobaczyć pierwsze naliczenia.</p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.index}>
                Cykl {row.index}: {formatDay(row.date)} · {stateLabel[row.state]}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          <PendingLabel pending={pending}>Zapisz wygraną</PendingLabel>
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Anuluj
        </Button>
      </div>
    </ActionForm>
  )
}

export function EndSubscriptionForm({
  agreementId,
  version,
}: {
  agreementId: string
  version: number
}) {
  const [state, action, pending] = useActionState(endSubscriptionAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor={`end-${agreementId}`}>Zakończenie abonamentu</FieldLabel>
        <Input id={`end-${agreementId}`} name="endsOn" type="date" />
        <p className="text-sm text-muted-foreground">Od tego dnia nie naliczaj kolejnych opłat.</p>
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        <PendingLabel pending={pending}>Zakończ abonament</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function ReviseSubscriptionForm({
  agreementId,
  version,
  cycles,
}: {
  agreementId: string
  version: number
  cycles: { index: number; date: string }[]
}) {
  const [state, action, pending] = useActionState(reviseSubscriptionAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="version" value={version} />
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor={`cycle-${agreementId}`}>Od cyklu</FieldLabel>
        <select id={`cycle-${agreementId}`} name="fromCycle" className={controlClassName} defaultValue="">
          <option value="">Wybierz przyszły cykl</option>
          {cycles.map((cycle) => (
            <option key={cycle.index} value={cycle.index}>
              Cykl {cycle.index} · {formatDay(cycle.date)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Nowa kwota obowiązuje od tego cyklu. Zamknięte miesiące zostają.
        </p>
      </Field>
      <Field data-invalid={state.fieldErrors?.amount ? true : undefined}>
        <FieldLabel htmlFor={`amount-${agreementId}`}>Nowa kwota brutto</FieldLabel>
        <Input id={`amount-${agreementId}`} name="amount" inputMode="decimal" />
        {state.fieldErrors?.amount ? <FieldError>{state.fieldErrors.amount}</FieldError> : null}
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        <PendingLabel pending={pending}>Zmień przyszłą kwotę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function ReplaceRevenueForm({
  entries,
}: {
  entries: { id: string; effectiveOn: string; amountCents: number; entryType: string }[]
}) {
  const [state, action, pending] = useActionState(replaceRevenueAction, initialState)
  const [entryId, setEntryId] = useState(entries[0]?.id ?? "")
  const [amount, setAmount] = useState("")
  const selected = entries.find((entry) => entry.id === entryId)
  const next = parseGrosze(amount)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak wpisu, który można skorygować.</p>
  }

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-3"
    >
      <FormFeedback state={state} />
      <Field>
        <FieldLabel htmlFor="correction-entry">Wpis</FieldLabel>
        <select
          id="correction-entry"
          name="entryId"
          className={controlClassName}
          value={entryId}
          onChange={(event) => setEntryId(event.target.value)}
        >
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {formatDay(entry.effectiveOn)} · {formatGrosze(entry.amountCents)}
            </option>
          ))}
        </select>
      </Field>
      <Field data-invalid={state.fieldErrors?.amount ? true : undefined}>
        <FieldLabel htmlFor="correction-amount">Nowa kwota brutto</FieldLabel>
        <Input
          id="correction-amount"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {state.fieldErrors?.amount ? <FieldError>{state.fieldErrors.amount}</FieldError> : null}
      </Field>
      <Field data-invalid={state.fieldErrors?.reason ? true : undefined}>
        <FieldLabel htmlFor="correction-reason">Powód</FieldLabel>
        <Input id="correction-reason" name="reason" maxLength={500} />
        {state.fieldErrors?.reason ? <FieldError>{state.fieldErrors.reason}</FieldError> : null}
      </Field>
      {selected && next != null ? (
        <p className="text-sm">
          Podgląd: odwrócenie {formatGrosze(selected.amountCents)} i nowy wpis {formatGrosze(next)} z datą{" "}
          {formatDay(selected.effectiveOn)}. Data wykonania korekty zapisze się osobno.
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        <PendingLabel pending={pending}>Zapisz korektę</PendingLabel>
      </Button>
    </ActionForm>
  )
}

export function RevertFinalizationForm({ dealId, version }: { dealId: string; version: number }) {
  const [state, action, pending] = useActionState(revertFinalizationAction, initialState)
  const [stage, setStage] = useState("negotiation")
  const choices = dealStages.filter(([code]) => code !== "won")

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
      <p className="text-sm text-muted-foreground">
        Cofnięcie wyłącza przyszłe naliczenia, odwraca już zapisane wpisy i dopiero zmienia etap.
        Aktywny abonament nie zostaje przy otwartej szansie.
      </p>
      <Field>
        <FieldLabel htmlFor="revert-stage">Etap po cofnięciu</FieldLabel>
        <select
          id="revert-stage"
          name="stage"
          className={controlClassName}
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          {choices.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {stage === "lost" ? (
        <Field data-invalid={state.fieldErrors?.lostReason ? true : undefined}>
          <FieldLabel htmlFor="revert-reason">Powód przegranej</FieldLabel>
          <Input id="revert-reason" name="lostReason" maxLength={500} />
          {state.fieldErrors?.lostReason ? <FieldError>{state.fieldErrors.lostReason}</FieldError> : null}
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="1" />
        Potwierdzam cofnięcie finalizacji
      </label>
      {state.fieldErrors?.confirm ? <FieldError>{state.fieldErrors.confirm}</FieldError> : null}
      <Button type="submit" variant="outline" disabled={pending}>
        <PendingLabel pending={pending}>Cofnij finalizację</PendingLabel>
      </Button>
    </ActionForm>
  )
}
