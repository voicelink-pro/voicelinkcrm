"use client"

import { useActionState, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { safeInternalPath } from "@/lib/auth/return-to"
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  requeueDeadJobsAction,
  savePushSubscriptionAction,
  sendPushTestAction,
  setMorningDigestAction,
  type NoticeState,
} from "@/lib/crm/notification-actions"
import { morningDigestPath } from "@/lib/crm/notification-path"
import type { DigestPreference, NotificationRow } from "@/lib/crm/notification-read"

const empty: NoticeState = { message: null, error: null }
const installationKey = "voicelink-installation"

function installationId() {
  const existing = window.localStorage.getItem(installationKey)
  if (existing) {
    return existing
  }
  const created = crypto.randomUUID()
  window.localStorage.setItem(installationKey, created)
  return created
}

function iosDevice() {
  const agent = window.navigator.userAgent
  const touchMac =
    window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(agent) || touchMac
}

function standalone() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}

function NoticeForm({
  action,
  label,
  children,
}: {
  action: (previous: NoticeState, formData: FormData) => Promise<NoticeState>
  label: string
  children?: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, empty)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {children}
      <Button type="submit" disabled={pending} variant="outline">
        {label}
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.message ? <span className="text-sm text-muted-foreground">{state.message}</span> : null}
    </form>
  )
}

export function NotificationCenter({
  rows,
  preference,
  publicKey,
  deadJobs,
}: {
  rows: NotificationRow[]
  preference: DigestPreference
  publicKey: string
  deadJobs: number
}) {
  const [pushState, setPushState] = useState<string | null>(null)
  const [installEvent, setInstallEvent] = useState<Event | null>(null)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("nieobsługiwane")
      return
    }
    if (iosDevice() && !standalone()) {
      setPushState("wymaga instalacji")
      return
    }
    if (!publicKey) {
      setPushState("brak klucza")
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      setPushState("odmowa")
      return
    }

    try {
      await navigator.serviceWorker.register("/sw.js")
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      const result = await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        authSecret: json.keys?.auth ?? "",
        installationId: installationId(),
        deviceLabel: navigator.userAgent.slice(0, 80),
      })
      setPushState(result.error ? "błąd" : "włączone")
    } catch {
      setPushState("błąd")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-medium">Poranny digest</h2>
        <p className="text-sm text-muted-foreground">
          Codziennie o 08:00 czasu Europe/Warsaw, także w weekend, powstaje jedno podsumowanie
          zadań na dziś. Ścieżka to {morningDigestPath}. Puste zestawienie nie tworzy powiadomienia.
          Zmiany statusu, przypisania, przypomnienia godzinowe i zaległe zadania nie są wysyłane.
        </p>
        <NoticeForm action={setMorningDigestAction} label="Zapisz digest">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={preference.morningDigestEnabled}
              className="size-4"
            />
            Poranne podsumowanie
          </label>
        </NoticeForm>
        <ul className="text-sm text-muted-foreground">
          <li>Zmiana statusu: niezatwierdzone, nie wysyła ({flag(preference.statusChange)})</li>
          <li>Przypisanie: niezatwierdzone, nie wysyła ({flag(preference.assignment)})</li>
          <li>Przypomnienie: niezatwierdzone, nie wysyła ({flag(preference.reminder)})</li>
          <li>Zaległe w digestcie: niezatwierdzone, nie wysyła ({flag(preference.includeOverdue)})</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-medium">Urządzenie</h2>
        <p className="text-sm text-muted-foreground">
          iPhone i iPad od wersji 16.4 dostają Web Push dopiero po dodaniu aplikacji do ekranu
          początkowego. Safari na komputerze nie pokazuje systemowego monitu instalacji. Android
          może pokazać taki monit.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void enablePush()}>
            Włącz powiadomienia
          </Button>
          {installEvent ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const prompt = installEvent as Event & { prompt: () => Promise<void> }
                void prompt.prompt()
              }}
            >
              Zainstaluj
            </Button>
          ) : null}
        </div>
        <p className="text-sm">{pushLabel(pushState, publicKey)}</p>
        <NoticeForm action={sendPushTestAction} label="Wyślij test na moje urządzenia" />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Centrum</h2>
          <NoticeForm action={markAllNotificationsReadAction} label="Oznacz wszystkie" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak powiadomień.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const href = safeInternalPath(row.targetPath, "/notifications")
              return (
                <li key={row.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.title}</p>
                      {row.body ? <p className="text-sm text-muted-foreground">{row.body}</p> : null}
                      <p className="text-sm text-muted-foreground">
                        {row.readAt ? "Przeczytane" : "Nieprzeczytane"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button nativeButton={false} variant="outline" render={<Link href={href} />}>
                        Otwórz
                      </Button>
                      {row.readAt ? null : (
                        <NoticeForm action={markNotificationReadAction} label="Przeczytane">
                          <input type="hidden" name="id" value={row.id} />
                        </NoticeForm>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-medium">Błędne prace</h2>
        <p className="text-sm text-muted-foreground">
          Martwych prac w kolejce: {deadJobs}. Wznowienie wraca do tej samej pracy i nie tworzy
          drugiej pozycji biznesowej.
        </p>
        <NoticeForm action={requeueDeadJobsAction} label="Wznów błędne prace" />
      </section>
    </div>
  )
}

function flag(value: boolean | null) {
  if (value === null) {
    return "puste"
  }
  return value ? "zapisane jako tak" : "zapisane jako nie"
}

function pushLabel(state: string | null, publicKey: string) {
  if (!publicKey) {
    return "Klucz publiczny VAPID nie jest ustawiony. Zapis w centrum działa, push na telefon nie."
  }
  if (state === "nieobsługiwane") {
    return "Ta przeglądarka nie obsługuje Web Push."
  }
  if (state === "wymaga instalacji") {
    return "Na iPhonie i iPadzie najpierw dodaj VoiceLink do ekranu początkowego."
  }
  if (state === "odmowa") {
    return "Przeglądarka odmówiła powiadomień."
  }
  if (state === "włączone") {
    return "To urządzenie jest zapisane."
  }
  if (state === "błąd") {
    return "Nie udało się włączyć powiadomień na tym urządzeniu."
  }
  if (state === "brak klucza") {
    return "Brak klucza publicznego. Push nie został włączony."
  }
  return "Powiadomienia urządzenia włączasz osobnym przyciskiem. Zgoda systemu jest osobna od digestu."
}
