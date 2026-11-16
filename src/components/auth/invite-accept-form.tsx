"use client"

import { useActionState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { acceptInviteAndSetPasswordAction } from "@/lib/crm/team-invite-actions"
import type { AuthFormState } from "@/lib/validation/auth"

const initialState: AuthFormState = {}

export function InviteAcceptForm({
  token,
  email,
}: {
  token: string
  email: string
}) {
  const [state, formAction, pending] = useActionState(
    acceptInviteAndSetPasswordAction,
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Nie zapisano hasła</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-login-email">Twój login (e-mail)</FieldLabel>
          <Input
            id="invite-login-email"
            type="email"
            value={email}
            readOnly
            disabled
            className="bg-muted/40"
          />
        </Field>

        <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
          <FieldLabel htmlFor="invite-password">Nowe hasło</FieldLabel>
          <Input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
            placeholder="Minimum 8 znaków"
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          {state.fieldErrors?.password ? (
            <FieldError>{state.fieldErrors.password}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={state.fieldErrors?.confirmPassword ? true : undefined}>
          <FieldLabel htmlFor="invite-confirm-password">Powtórz hasło</FieldLabel>
          <Input
            id="invite-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          />
          {state.fieldErrors?.confirmPassword ? (
            <FieldError>{state.fieldErrors.confirmPassword}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Zapisz hasło i przejdź do CRM
      </Button>
    </form>
  )
}
