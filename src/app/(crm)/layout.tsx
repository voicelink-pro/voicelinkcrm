import { redirect } from "next/navigation"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

import { LiveRefresh } from "@/components/crm/live-refresh"
import { AccessNotice } from "@/components/shared/access-notice"
import { AppShell } from "@/components/shell/app-shell"
import { getWorkspaceGate } from "@/lib/auth/access"
import { listNotifications, unreadNotificationCount } from "@/lib/crm/notification-read"
import { createClient } from "@/lib/supabase/server"

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const gate = await getWorkspaceGate()

  if (gate.kind === "unauthenticated" || gate.kind === "unconfigured") {
    redirect("/login")
  }

  if (gate.kind === "schema-missing") {
    return (
      <AccessNotice
        email={gate.email}
        title="Członkostwo nie może być sprawdzone"
        description="Baza nie zawiera jeszcze tabel workspace. Dane CRM pozostają niedostępne do czasu migracji."
      />
    )
  }

  if (gate.kind === "unavailable") {
    return (
      <AccessNotice
        email={gate.email}
        correlationId={gate.correlationId}
        title="Nie udało się potwierdzić dostępu"
        description="Spróbuj ponownie. Dane CRM nie zostały wyświetlone."
      />
    )
  }

  if (gate.kind === "denied") {
    return (
      <AccessNotice
        email={gate.email}
        title="Brak dostępu do workspace"
        description="To konto nie jest aktywnym członkiem VoiceLink. Publiczna rejestracja nie nadaje dostępu."
      />
    )
  }

  const supabase = await createClient()
  const [{ rows: notifications }, unreadCount, viewerProfile] = await Promise.all([
    listNotifications(),
    unreadNotificationCount(),
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", gate.userId)
      .maybeSingle(),
  ])

  return (
    <AppShell
      email={gate.email}
      userId={gate.userId}
      avatarUrl={viewerProfile.data?.avatar_url ?? null}
      unreadCount={unreadCount}
      notifications={notifications.slice(0, 8)}
    >
      <LiveRefresh />
      {children}
    </AppShell>
  )
}
