"use client"

import { useActionState } from "react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { updateDealAction } from "@/lib/crm/actions"
import { productTypes } from "@/lib/crm/labels"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

export function LeadWindowForm({
  dealId,
  version,
  title,
  productType,
  description,
  primaryContactId,
}: {
  dealId: string
  version: number
  title: string
  productType: string | null
  description: string | null
  primaryContactId: string | null
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
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="primaryContactId" value={primaryContactId ?? ""} />
      <FormFeedback state={state} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="lead-window-product">Zainteresowany produktem</FieldLabel>
          <select
            id="lead-window-product"
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
          <FieldLabel htmlFor="lead-window-note">Notatka</FieldLabel>
          <textarea
            id="lead-window-note"
            name="description"
            className={textAreaClassName}
            defaultValue={description ?? ""}
          />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Zapisz
      </Button>
    </ActionForm>
  )
}
