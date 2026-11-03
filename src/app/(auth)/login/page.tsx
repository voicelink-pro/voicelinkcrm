import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { firstSearchParam, safeInternalPath } from "@/lib/auth/return-to"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

export const metadata: Metadata = {
  title: "Logowanie",
}

const notices: Record<string, string> = {
  auth: "Link logowania wygasł albo jest nieprawidłowy. Zaloguj się ponownie.",
  config: "Brak konfiguracji połączenia z bazą.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; error?: string | string[] }>
}) {
  const params = await searchParams
  const returnTo = safeInternalPath(firstSearchParam(params.returnTo))
  const notice = notices[firstSearchParam(params.error) ?? ""]
  const user = await getAuthenticatedUser()

  if (user) {
    redirect(returnTo)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logowanie</CardTitle>
        <CardDescription>
          Dostęp mają wyłącznie konta zaproszone do workspace VoiceLink. Publiczna
          rejestracja jest wyłączona.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm
          returnTo={returnTo}
          configured={Boolean(getPublicSupabaseEnv())}
          notice={notice}
        />
        <Link
          href="/reset-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Nie pamiętam hasła
        </Link>
      </CardContent>
    </Card>
  )
}
