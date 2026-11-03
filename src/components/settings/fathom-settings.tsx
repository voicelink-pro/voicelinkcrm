"use client"

import { useActionState } from "react"

import { controlClassName } from "@/components/crm/control-styles"
import { Button } from "@/components/ui/button"
import {
  ensureFirstFathomAccountAction,
  ensureSecondFathomAccountAction,
  setFathomEmailAction,
  setFathomPollAction,
  syncFathomAction,
  type FathomFormState,
} from "@/lib/integrations/fathom/actions"

type FathomConnectionCard = {
  id: string
  label: string
  status: string
  enabled: boolean
  externalAccountEmail: string | null
  secretRef: string
  lastSuccessAt: string | null
  lastError: string | null
}

const empty: FathomFormState = { message: undefined }

export function FathomSettings({
  connections,
  webhookOrigin,
  pollMinutes,
  secrets,
}: {
  connections: FathomConnectionCard[]
  webhookOrigin: string | null
  pollMinutes: number
  secrets: Record<string, { apiKey: boolean; webhookSecret: boolean }>
}) {
  const hasFirst = connections.some((connection) => connection.secretRef === "fathom/account-1")
  const hasSecond = connections.some((connection) => connection.secretRef === "fathom/account-2")

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 text-sm">
      <h2 className="text-lg font-semibold">Spotkania Fathom</h2>
      <p>
        Archiwum odbytych nagrań. Webhook przyjmuje tylko własne nagrania konta (`my_recordings`),
        z podsumowaniem, transkrypcją i propozycjami zadań. Adres nagrania otwiera się w Fathomie.
      </p>
      <p>
        Uzupełnianie po utracie webhooka jest co {pollMinutes} min. Ten odstęp jest parametrem.
        Okresowy worker pobiera nagrania, gdy cron woła tik i prace są włączone. Przycisk Synchronizuj pobiera teraz.
      </p>
      <PollForm minutes={pollMinutes} />
      {connections.map((connection) => (
        <ConnectionCard
          key={connection.id}
          connection={connection}
          origin={webhookOrigin}
          secret={secrets[connection.secretRef] ?? { apiKey: false, webhookSecret: false }}
        />
      ))}
      {hasFirst ? null : <FirstAccountForm />}
      {hasFirst && !hasSecond ? <SecondAccountForm /> : null}
    </section>
  )
}

function ConnectionCard({
  connection,
  origin,
  secret,
}: {
  connection: FathomConnectionCard
  origin: string | null
  secret: { apiKey: boolean; webhookSecret: boolean }
}) {
  const webhook = origin ? `${origin}/api/integrations/fathom/${connection.id}/webhook` : null
  return (
    <div className="grid gap-3 border-t pt-3">
      <h3 className="font-semibold">{connection.label}</h3>
      <p>Stan: {connection.status === "error" ? "błąd połączenia" : connection.enabled ? "aktywne" : "wyłączone"}</p>
      <p>Ostatnia udana synchronizacja: {connection.lastSuccessAt ?? "Nie uzupełniono"}</p>
      {connection.lastError ? <p>Ostatni błąd: {connection.lastError}</p> : null}
      <p>Klucz API: {secret.apiKey ? "ustawiony po stronie serwera" : "brak w zmiennych serwera"}</p>
      <p>Sekret webhooka: {secret.webhookSecret ? "ustawiony po stronie serwera" : "brak w zmiennych serwera"}</p>
      <p>Adres webhooka: {webhook ?? "Ustaw APP_URL, żeby pokazać adres."}</p>
      <p className="text-muted-foreground">Wartości klucza i sekretu nie są pokazywane.</p>
      <EmailForm connectionId={connection.id} email={connection.externalAccountEmail} />
      <SyncForm connectionId={connection.id} />
    </div>
  )
}

function EmailForm({ connectionId, email }: { connectionId: string; email: string | null }) {
  const [state, action, pending] = useActionState(setFathomEmailAction, empty)
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <label className="grid gap-1">
        E-mail osoby, której własne nagrania mają być pobierane
        <input name="email" type="email" defaultValue={email ?? ""} className={controlClassName} />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Zapisz e-mail
      </Button>
      {state.message ? <p>{state.message}</p> : null}
    </form>
  )
}

function SyncForm({ connectionId }: { connectionId: string }) {
  const [state, action, pending] = useActionState(syncFathomAction, empty)
  return (
    <div className="grid gap-3">
      <form action={action}>
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="mode" value="incremental" />
        <Button type="submit" disabled={pending}>
          Synchronizuj
        </Button>
      </form>
      <form action={action} className="grid gap-2 md:grid-cols-2">
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="mode" value="backfill" />
        <p className="md:col-span-2 text-muted-foreground">
          Import zakresu wymaga obu dat i nie pobiera całej historii. Dni są liczone w Europe/Warsaw,
          od początku pierwszego dnia do początku dnia po ostatnim.
        </p>
        <label className="grid gap-1">
          Od
          <input name="from" type="date" required className={controlClassName} />
        </label>
        <label className="grid gap-1">
          Do
          <input name="to" type="date" required className={controlClassName} />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          Importuj zakres
        </Button>
      </form>
      {state.message ? <p>{state.message}</p> : null}
    </div>
  )
}

function PollForm({ minutes }: { minutes: number }) {
  const [state, action, pending] = useActionState(setFathomPollAction, empty)
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">
        Odstęp uzupełniania w minutach
        <input
          name="minutes"
          type="number"
          min={5}
          max={1440}
          defaultValue={minutes}
          className={controlClassName}
        />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Zapisz odstęp
      </Button>
      {state.message ? <p>{state.message}</p> : null}
    </form>
  )
}

function FirstAccountForm() {
  const [state, action, pending] = useActionState(ensureFirstFathomAccountAction, empty)
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <p>Pierwsze konto używa sekretu FATHOM_ACCOUNT_1_API_KEY. Wartość nie jest pokazywana.</p>
      <Button type="submit" variant="outline" disabled={pending}>
        Dodaj konto Fathom
      </Button>
      {state.message ? <p>{state.message}</p> : null}
    </form>
  )
}

function SecondAccountForm() {
  const [state, action, pending] = useActionState(ensureSecondFathomAccountAction, empty)
  return (
    <form action={action} className="grid gap-2 border-t pt-3">
      <p>Drugie konto używa osobnego połączenia i tej samej tabeli spotkań.</p>
      <Button type="submit" variant="outline" disabled={pending}>
        Dodaj drugie konto
      </Button>
      {state.message ? <p>{state.message}</p> : null}
    </form>
  )
}
