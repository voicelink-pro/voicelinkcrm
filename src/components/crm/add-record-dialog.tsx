"use client"

import { useActionState, useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName } from "@/components/crm/control-styles"
import { FormFeedback } from "@/components/crm/controls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createManualClientAction } from "@/lib/crm/actions"
import { implementationStages } from "@/lib/crm/labels"
import type { CrmFormState } from "@/lib/crm/validation"

const initialState: CrmFormState = {}

export function AddRecordDialog({ purpose }: { purpose: "client" | "deployment" }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createManualClientAction, initialState)
  const deployment = purpose === "deployment"
  const prefix = deployment ? "deployment" : "client"

  useEffect(() => {
    if (state.savedAt) setOpen(false)
  }, [state.savedAt])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className="max-md:h-8 max-md:px-2.5 max-md:text-xs" />
        }
      >
        <PlusIcon data-icon="inline-start" />
        Dodaj
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deployment ? "Nowe wdrożenie" : "Nowy klient"}</DialogTitle>
          <DialogDescription>
            {deployment
              ? "Klient od razu pojawi się na liście wdrożeń z wybranym etapem."
              : "Klient od razu pojawi się na liście. Nie tworzy to leada."}
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={action}
          pending={pending}
          failed={Boolean(state.error || state.fieldErrors)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="purpose" value={purpose} />
          <FormFeedback state={state} />
          <FieldGroup>
            <Field data-invalid={state.fieldErrors?.displayName ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-name`}>
                {deployment ? "Nazwa klienta" : "Nazwa"}
              </FieldLabel>
              <Input
                id={`${prefix}-name`}
                name="displayName"
                required
                autoComplete="organization"
                placeholder="np. Klinika Północ"
              />
              {state.fieldErrors?.displayName ? (
                <FieldError>{state.fieldErrors.displayName}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-company`}>Firma</FieldLabel>
              <Input id={`${prefix}-company`} name="companyName" autoComplete="organization" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-contact`}>Osoba kontaktowa</FieldLabel>
              <Input id={`${prefix}-contact`} name="fullName" autoComplete="name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${prefix}-email`}>E-mail</FieldLabel>
                <Input id={`${prefix}-email`} name="email" type="email" autoComplete="email" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-phone`}>Telefon</FieldLabel>
                <Input
                  id={`${prefix}-phone`}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+48…"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${prefix}-nip`}>NIP</FieldLabel>
              <Input id={`${prefix}-nip`} name="nip" inputMode="numeric" autoComplete="off" />
            </Field>
            {deployment ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-stage`}>Etap wdrożenia</FieldLabel>
                  <select
                    id={`${prefix}-stage`}
                    name="implementationStage"
                    className={controlClassName}
                    defaultValue="in_progress"
                  >
                    {implementationStages.map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-due`}>Termin</FieldLabel>
                  <Input id={`${prefix}-due`} name="implementationDueOn" type="date" />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-systems`}>Systemy integracji</FieldLabel>
                  <Input
                    id={`${prefix}-systems`}
                    name="integrationSystems"
                    placeholder="np. Booksy, Google Calendar"
                  />
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {deployment ? "Dodaj wdrożenie" : "Dodaj klienta"}
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
