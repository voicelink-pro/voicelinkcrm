"use server"

import { redirect } from "next/navigation"

import { safeInternalPath } from "@/lib/auth/return-to"
import {
  fieldErrorsFromZod,
  loginSchema,
  newPasswordSchema,
  resetRequestSchema,
  type AuthFormState,
} from "@/lib/validation/auth"
import { getWorkspaceGate } from "@/lib/auth/access"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getAppOrigin, getPublicSupabaseEnv } from "@/lib/supabase/env"

const RESET_SENT_MESSAGE =
  "Jeśli konto istnieje, wysłaliśmy instrukcję ustawienia hasła."

function mapLoginError(error: { code?: string; status?: number }) {
  if (error.code === "invalid_credentials") {
    return "Nieprawidłowy e-mail lub hasło."
  }

  if (error.code === "email_not_confirmed") {
    return "Konto nie zostało potwierdzone. Poproś operatora o aktywację."
  }

  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Zbyt wiele prób. Spróbuj ponownie za chwilę."
  }

  if (error.status && error.status >= 500) {
    return "Usługa logowania jest chwilowo niedostępna. Logowanie nie zostało wykonane."
  }

  return "Nie udało się zalogować. Spróbuj ponownie."
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!getPublicSupabaseEnv()) {
    return {
      error: "Brak konfiguracji połączenia z bazą. Logowanie nie zostało wykonane.",
    }
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    returnTo: formData.get("returnTo") ?? undefined,
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  const supabase = await createClient()
  let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>

  try {
    result = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })
  } catch {
    return { error: "Brak połączenia. Logowanie nie zostało wykonane." }
  }

  if (result.error) {
    return { error: mapLoginError(result.error) }
  }

  redirect(safeInternalPath(parsed.data.returnTo))
}

export async function logoutAction(formData: FormData) {
  if (getPublicSupabaseEnv()) {
    const installationId = formData.get("installationId")
    const gate = await getWorkspaceGate()

    if (gate.kind === "member" && typeof installationId === "string" && installationId.trim()) {
      try {
        const admin = createAdminClient()
        await admin.schema("private").rpc("deactivate_installation" as never, {
          p_actor_user_id: gate.userId,
          p_installation_id: installationId.trim(),
        } as never)
      } catch {
        // Sesja i tak się kończy. Inne urządzenia zostają zapisane.
      }
    }

    const supabase = await createClient()

    try {
      await supabase.auth.signOut()
    } catch {
      // Wylogowanie lokalne i tak kończy się przekierowaniem na ekran logowania.
    }
  }

  redirect("/login")
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  if (!getPublicSupabaseEnv()) {
    return {
      error: "Brak konfiguracji połączenia z bazą. Wiadomość nie została wysłana.",
    }
  }

  const origin = getAppOrigin()

  if (!origin) {
    return {
      error: "Brak adresu aplikacji. Wiadomość resetująca nie została wysłana.",
    }
  }

  const supabase = await createClient()
  let error: { code?: string; status?: number; message?: string } | null = null

  try {
    const result = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })
    error = result.error
  } catch {
    return { error: "Brak połączenia. Wiadomość nie została wysłana." }
  }

  if (error) {
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return { error: "Zbyt wiele prób. Spróbuj ponownie za chwilę." }
    }

    if (error.status && error.status >= 500) {
      return { error: "Usługa jest chwilowo niedostępna. Wiadomość nie została wysłana." }
    }
  }

  return { message: RESET_SENT_MESSAGE }
}

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  if (!getPublicSupabaseEnv()) {
    return {
      error: "Brak konfiguracji połączenia z bazą. Hasło nie zostało zmienione.",
    }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    return {
      error: "Sesja resetu wygasła. Poproś o nowy link. Hasło nie zostało zmienione.",
    }
  }

  let error: { status?: number; message?: string } | null = null

  try {
    const result = await supabase.auth.updateUser({
      password: parsed.data.password,
    })
    error = result.error
  } catch {
    return { error: "Brak połączenia. Hasło nie zostało zmienione." }
  }

  if (error) {
    if (error.status && error.status >= 500) {
      return { error: "Usługa jest chwilowo niedostępna. Hasło nie zostało zmienione." }
    }

    return { error: "Nie udało się zapisać hasła. Sprawdź wymagania i spróbuj ponownie." }
  }

  redirect("/")
}
