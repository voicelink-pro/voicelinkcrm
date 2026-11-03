import type { Metadata } from "next"
import Link from "next/link"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

export const metadata: Metadata = {
  title: "Reset hasła",
}

export default async function ResetPasswordPage() {
  const user = await getAuthenticatedUser()
  const mode = user ? "update" : "request"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "update" ? "Nowe hasło" : "Reset hasła"}</CardTitle>
        <CardDescription>
          {mode === "update"
            ? "Ustaw nowe hasło do istniejącego konta. Samodzielne zakładanie konta nie jest dostępne."
            : "Wyślemy link do ustawienia hasła, jeśli adres należy do zaproszonego konta."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ResetPasswordForm mode={mode} configured={Boolean(getPublicSupabaseEnv())} />
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Wróć do logowania
        </Link>
      </CardContent>
    </Card>
  )
}
