"use client"

import { useActionState, useState } from "react"

import { FormFeedback } from "@/components/crm/controls"
import { controlClassName } from "@/components/crm/control-styles"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { resolveReviewAction } from "@/lib/integrations/n8n/actions"
import type { ReviewFormState } from "@/lib/integrations/n8n/actions"
import { formatDateTime } from "@/lib/crm/format"
import { missing } from "@/lib/crm/labels"

const reasons: Record<string, string> = {
  invalid_contact: "Brak poprawnego e-maila albo telefonu. Nic nie zostało dopisane.",
  matching_contact: "Jest już kontakt z tym e-mailem albo telefonem. Nic nie zostało scalone.",
}

const initialState: ReviewFormState = {}

export function ReviewList({
  items,
  accounts,
  deals,
}: {
  items: {
    id: string
    reason: string
    createdAt: string
    fullName: string
    email: string
    phone: string
    source: string
    sourceRecordId: string
  }[]
  accounts: { id: string; displayName: string }[]
  deals: { id: string; accountId: string; title: string }[]
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak zgłoszeń oczekujących na decyzję.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} accounts={accounts} deals={deals} />
      ))}
    </div>
  )
}

function ReviewCard({
  item,
  accounts,
  deals,
}: {
  item: {
    id: string
    reason: string
    createdAt: string
    fullName: string
    email: string
    phone: string
    source: string
    sourceRecordId: string
  }
  accounts: { id: string; displayName: string }[]
  deals: { id: string; accountId: string; title: string }[]
}) {
  const [state, action, pending] = useActionState(resolveReviewAction, initialState)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const accountDeals = deals.filter((deal) => deal.accountId === accountId)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <input type="hidden" name="reviewId" value={item.id} />
      <FormFeedback state={state} />
      <div className="text-sm">
        <p className="font-medium">{missing(item.fullName)}</p>
        <p>{reasons[item.reason] ?? item.reason}</p>
        <p>E-mail: {missing(item.email)}</p>
        <p>Telefon: {missing(item.phone)}</p>
        <p>
          Źródło: {missing(item.source)} · {missing(item.sourceRecordId)}
        </p>
        <p className="text-muted-foreground">{formatDateTime(item.createdAt)}</p>
      </div>
      <Field>
        <FieldLabel htmlFor={`account-${item.id}`}>Karta docelowa</FieldLabel>
        <select
          id={`account-${item.id}`}
          name="accountId"
          className={controlClassName}
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          <option value="">Wybierz kartę</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`deal-${item.id}`}>Szansa</FieldLabel>
        <select id={`deal-${item.id}`} name="dealId" className={controlClassName} defaultValue="">
          <option value="">Bez konkretnej szansy</option>
          {accountDeals.map((deal) => (
            <option key={deal.id} value={deal.id}>
              {deal.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="link" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Powiąż ręcznie
        </Button>
        <Button type="submit" name="action" value="dismiss" variant="outline" disabled={pending}>
          Odrzuć zgłoszenie
        </Button>
      </div>
    </form>
  )
}
