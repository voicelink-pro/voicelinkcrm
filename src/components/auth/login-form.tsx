"use client"

import { useActionState } from "react"

import { ActionForm } from "@/components/crm/action-form"
import { loginAction } from "@/lib/auth/actions"
import type { AuthFormState } from "@/lib/validation/auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const initialState: AuthFormState = {}

export function LoginForm({
  returnTo,
  configured,
  notice,
}: {
  returnTo: string
  configured: boolean
  notice?: string
}) {
  const [state, action, pending] = useActionState(loginAction, initialState)
  const emailError = state.fieldErrors?.email
  const passwordError = state.fieldErrors?.password

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.error || state.fieldErrors)}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      {!configured ? (
        <Alert>
          <AlertTitle>Brak połączenia z bazą</AlertTitle>
          <AlertDescription>
            Uzupełnij zmienne środowiska Supabase. Logowanie nie jest możliwe.
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się dokończyć logowania</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Logowanie nie powiodło się</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={emailError ? true : undefined} data-disabled={configured ? undefined : true}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            disabled={!configured || pending}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "email-error" : undefined}
          />
          {emailError ? <FieldError id="email-error">{emailError}</FieldError> : null}
        </Field>
        <Field data-invalid={passwordError ? true : undefined} data-disabled={configured ? undefined : true}>
          <FieldLabel htmlFor="password">Hasło</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!configured || pending}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          {passwordError ? <FieldError id="password-error">{passwordError}</FieldError> : null}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={!configured || pending}>
        {pending ? <Spinner data-icon="inline-start" aria-label="Logowanie" /> : null}
        Zaloguj się
      </Button>
    </ActionForm>
  )
}
