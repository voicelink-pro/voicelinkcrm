"use client"

import { useActionState } from "react"

import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/lib/auth/actions"
import type { AuthFormState } from "@/lib/validation/auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const initialState: AuthFormState = {}

export function ResetPasswordForm({
  mode,
  configured,
}: {
  mode: "request" | "update"
  configured: boolean
}) {
  const action = mode === "request" ? requestPasswordResetAction : updatePasswordAction
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!configured ? (
        <Alert>
          <AlertTitle>Brak połączenia z bazą</AlertTitle>
          <AlertDescription>Hasło nie może zostać zmienione.</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert>
          <AlertTitle>Sprawdź pocztę</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Nie zapisano zmiany</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {mode === "request" ? (
        <FieldGroup>
          <Field
            data-invalid={state.fieldErrors?.email ? true : undefined}
            data-disabled={configured ? undefined : true}
          >
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={!configured || pending}
              aria-invalid={Boolean(state.fieldErrors?.email)}
            />
            {state.fieldErrors?.email ? <FieldError>{state.fieldErrors.email}</FieldError> : null}
          </Field>
        </FieldGroup>
      ) : (
        <FieldGroup>
          <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
            <FieldLabel htmlFor="password">Nowe hasło</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={!configured || pending}
              aria-invalid={Boolean(state.fieldErrors?.password)}
            />
            {state.fieldErrors?.password ? (
              <FieldError>{state.fieldErrors.password}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={state.fieldErrors?.confirmPassword ? true : undefined}>
            <FieldLabel htmlFor="confirmPassword">Powtórz hasło</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={!configured || pending}
              aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            />
            {state.fieldErrors?.confirmPassword ? (
              <FieldError>{state.fieldErrors.confirmPassword}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
      )}
      <Button type="submit" disabled={!configured || pending}>
        {pending ? <Spinner data-icon="inline-start" aria-label="Zapisywanie" /> : null}
        {mode === "request" ? "Wyślij link" : "Zapisz hasło"}
      </Button>
    </form>
  )
}
