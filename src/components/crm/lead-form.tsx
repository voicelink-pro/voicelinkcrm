"use client"

import { useActionState } from "react"
import Link from "next/link"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createLeadAction } from "@/lib/crm/actions"
import { productTypes } from "@/lib/crm/labels"
import type { MemberOption } from "@/lib/crm/queries"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

export function LeadForm({
  members,
  cancelHref,
}: {
  members: MemberOption[]
  cancelHref: string
}) {
  const [state, action, pending] = useActionState(createLeadAction, initialState)

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors || state.duplicate)}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div>
        <h2 className="text-lg font-semibold">Nowy lead</h2>
        <p className="text-sm text-muted-foreground">
          Firma jest opcjonalna. Ten sam e-mail albo telefon nie scala rekordów automatycznie.
        </p>
      </div>
      <FormFeedback state={state} />
      <FieldGroup>
        <Field data-invalid={state.fieldErrors?.fullName ? true : undefined}>
          <FieldLabel htmlFor="lead-name">Imię i nazwisko</FieldLabel>
          <Input id="lead-name" name="fullName" required autoComplete="name" />
          {state.fieldErrors?.fullName ? <FieldError>{state.fieldErrors.fullName}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-company">Firma</FieldLabel>
          <Input id="lead-company" name="companyName" autoComplete="organization" />
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-email">E-mail</FieldLabel>
          <Input id="lead-email" name="email" type="email" autoComplete="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-phone">Telefon</FieldLabel>
          <Input id="lead-phone" name="phone" type="tel" autoComplete="tel" placeholder="+48…" />
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-product">Produkt</FieldLabel>
          <select id="lead-product" name="productType" className={controlClassName} defaultValue="">
            <option value="">Nie uzupełniono</option>
            {productTypes.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
          <FieldLabel htmlFor="lead-title">Tytuł szansy</FieldLabel>
          <Input id="lead-title" name="title" />
          {state.fieldErrors?.title ? <FieldError>{state.fieldErrors.title}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-owner">Opiekun</FieldLabel>
          <select id="lead-owner" name="ownerUserId" className={controlClassName} defaultValue="">
            <option value="">Bez opiekuna</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Zapisz leada
        </Button>
        {state.duplicate ? (
          <Button type="submit" name="confirmDuplicate" value="1" variant="outline" disabled={pending}>
            Utwórz mimo podobnego kontaktu
          </Button>
        ) : null}
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={cancelHref} />}>
          Anuluj
        </Button>
      </div>
    </ActionForm>
  )
}
