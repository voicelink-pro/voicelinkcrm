import type { Metadata } from "next"

import { FathomSettings } from "@/components/settings/fathom-settings"
import { ProfileAvatarSettings } from "@/components/settings/profile-avatar-settings"
import { ReviewList } from "@/components/settings/review-list"
import { RetryLoad } from "@/components/shared/retry-load"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getWorkspaceGate } from "@/lib/auth/access"
import { formatDateTime } from "@/lib/crm/format"
import { listMembers } from "@/lib/crm/queries"
import { fathomSecretConfigured } from "@/lib/integrations/fathom/secrets"
import { listFathomConnections } from "@/lib/integrations/fathom/store"
import { n8nTokenConfigured } from "@/lib/integrations/n8n/config"
import { importOverview } from "@/lib/integrations/n8n/queries"
import { getAppOrigin } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Ustawienia",
}

export default async function SettingsPage() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return null
  }

  const origin = getAppOrigin()
  const webhookUrl = origin ? `${origin}/api/integrations/n8n/leads` : null
  const [{ counts, reviews, error }, directories, fathom, settings, members] = await Promise.all([
    importOverview(gate.workspaceId),
    listDirectories(),
    listFathomConnections(gate.workspaceId),
    fathomSettings(),
    listMembers(),
  ])
  const secrets = Object.fromEntries(
    fathom.connections.map((connection) => [connection.secretRef, fathomSecretConfigured(connection.secretRef)]),
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">
          Profile użytkowników, integracje Fathom i webhook leadów z n8n.
        </p>
      </div>

      <ProfileAvatarSettings viewerId={gate.userId} members={members} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Stan integracji niedostępny</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : null}

      <section className="grid gap-2 rounded-xl border bg-card p-4 text-sm">
        <h2 className="text-lg font-semibold">Połączenie n8n</h2>
        <p>Adres: {webhookUrl ?? "Ustaw APP_URL, żeby pokazać adres webhooka."}</p>
        <p>Token: {n8nTokenConfigured() ? "ustawiony po stronie serwera" : "brak w zmiennych serwera"}</p>
        <p>Stan: {counts.connectionStatus === "error" ? "błąd ostatniego odbioru" : counts.connectionStatus === "active" ? "aktywne" : "brak odbioru"}</p>
        <p>Ostatni odbiór: {formatDateTime(counts.lastReceivedAt)}</p>
        <p>Ostatni udany zapis: {formatDateTime(counts.lastSuccessAt)}</p>
        {counts.lastError ? <p>Ostatni kod błędu: {counts.lastError}</p> : null}
        <p>
          Przyjęte: {counts.processed} · Duplikaty: {counts.duplicate} · Jakość: {counts.review + counts.invalid} · Testy: {counts.ignoredTest}
        </p>
        <p className="text-muted-foreground">
          Wartość tokenu nie jest pokazywana. Instrukcja mapowania i retry jest w docs/API.md.
        </p>
      </section>

      {fathom.message ? (
        <Alert variant="destructive">
          <AlertTitle>Połączenia Fathom niedostępne</AlertTitle>
          <AlertDescription>{fathom.message}</AlertDescription>
          <RetryLoad />
        </Alert>
      ) : (
        <FathomSettings
          connections={fathom.connections}
          webhookOrigin={origin}
          pollMinutes={settings.pollMinutes}
          secrets={secrets}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Zgłoszenia do decyzji</h2>
        <ReviewList items={reviews} accounts={directories.accounts} deals={directories.deals} />
      </section>

      <section className="text-sm text-muted-foreground">
        Preferencje powiadomień i kalendarz follow-upu nie są jeszcze włączone. Reguły D1 i D2 pozostają nieaktywne.
      </section>
    </div>
  )
}

async function fathomSettings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("automation_settings")
    .select("fathom_poll_interval_minutes")
    .limit(1)
    .maybeSingle()
  return { pollMinutes: data?.fathom_poll_interval_minutes ?? 15 }
}

async function listDirectories() {
  const supabase = await createClient()
  const [accounts, deals] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, display_name")
      .is("archived_at", null)
      .order("display_name")
      .limit(200),
    supabase
      .from("deals")
      .select("id, account_id, title")
      .is("archived_at", null)
      .order("title")
      .limit(400),
  ])

  return {
    accounts: (accounts.data ?? []).map((row) => ({ id: row.id, displayName: row.display_name })),
    deals: (deals.data ?? []).map((row) => ({
      id: row.id,
      accountId: row.account_id,
      title: row.title,
    })),
  }
}
