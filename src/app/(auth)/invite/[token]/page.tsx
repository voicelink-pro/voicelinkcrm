import type { Metadata } from "next"
import Link from "next/link"

import { InviteAcceptForm } from "@/components/auth/invite-accept-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getActiveInviteByToken } from "@/lib/crm/team-invite-actions"

export const metadata: Metadata = {
  title: "Zaproszenie do VoiceLink CRM",
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await getActiveInviteByToken(token)

  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zaproszenie wygasło lub zostało już użyte</CardTitle>
          <CardDescription>
            Ten link jest ważny przez 48 godzin od wygenerowania i działa do momentu ustawienia hasła.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>Link nie jest już aktywny</AlertTitle>
            <AlertDescription>
              Jeśli hasło zostało już ustawione, zaloguj się swoim adresem e-mail. W przeciwnym razie poproś administratora o wygenerowanie nowego linku w Ustawieniach.
            </AlertDescription>
          </Alert>
          <Link
            href="/login"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Przejdź do logowania
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Witaj, {invite.fullName}</CardTitle>
        <CardDescription>
          Ustaw własne hasło do konta <strong>{invite.email}</strong> w VoiceLink CRM. Link jest aktywny przez 48 godzin — wygaśnie dopiero po zapisaniu hasła.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InviteAcceptForm token={token} email={invite.email} />
        <Link
          href="/login"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Mam już ustawione hasło — przejdź do logowania
        </Link>
      </CardContent>
    </Card>
  )
}
