"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  savePushSubscriptionAction,
  sendPushTestAction,
  type NoticeState,
} from "@/lib/crm/notification-actions"

const empty: NoticeState = { message: null, error: null }
const installationKey = "voicelink-installation"

function getInstallationId() {
  try {
    const existing = window.localStorage.getItem(installationKey)
    if (existing) {
      return existing
    }
    const created = crypto.randomUUID()
    window.localStorage.setItem(installationKey, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export function isIosDevice() {
  if (typeof window === "undefined") return false
  const agent = window.navigator.userAgent
  const touchMac =
    window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(agent) || touchMac
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

export function urlBase64ToUint8Array(value: string) {
  const cleaned = value.trim()
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4)
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}

export async function subscribeCurrentDevice(publicKey: string): Promise<{
  ok: boolean
  state:
    | "włączone"
    | "wymaga_instalacji_ios"
    | "nieobsługiwane"
    | "brak_klucza"
    | "odmowa"
    | "błąd"
  detail?: string
}> {
  if (isIosDevice() && !isStandalonePwa()) {
    return { ok: false, state: "wymaga_instalacji_ios" }
  }

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return { ok: false, state: "nieobsługiwane" }
  }

  if (!publicKey.trim()) {
    return { ok: false, state: "brak_klucza" }
  }

  // WAŻNE na iOS Safari PWA: requestPermission() musi być pierwszym await w obsłudze kliknięcia!
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission()

  if (permission !== "granted") {
    return { ok: false, state: "odmowa" }
  }

  try {
    await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    })
    const registration = await navigator.serviceWorker.ready
    const appServerKey = urlBase64ToUint8Array(publicKey)

    let subscription: PushSubscription
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      })
    } catch {
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      })
    }

    const json = subscription.toJSON()
    const result = await savePushSubscriptionAction({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      authSecret: json.keys?.auth ?? "",
      installationId: getInstallationId(),
      deviceLabel: navigator.userAgent.slice(0, 80),
    })

    if (result.error) {
      return { ok: false, state: "błąd", detail: result.error }
    }

    return { ok: true, state: "włączone" }
  } catch (err) {
    return {
      ok: false,
      state: "błąd",
      detail: err instanceof Error ? err.message : undefined,
    }
  }
}

export function PushDeviceCard({
  publicKey,
  outboundReady,
  showCenterLink = false,
}: {
  publicKey: string
  outboundReady: boolean
  showCenterLink?: boolean
}) {
  const [pushState, setPushState] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installEvent, setInstallEvent] = useState<Event | null>(null)
  const [testState, testAction, testPending] = useActionState(sendPushTestAction, empty)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function inspectCurrentDevice() {
      if (isIosDevice() && !isStandalonePwa()) {
        if (!cancelled) setPushState("wymaga_instalacji_ios")
        return
      }
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setPushState("nieobsługiwane")
        return
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setPushState("odmowa")
        return
      }
      if (Notification.permission === "granted") {
        try {
          const registration = await navigator.serviceWorker.ready
          const existing = await registration.pushManager.getSubscription()
          if (existing && !cancelled) {
            setPushState("włączone")
            const json = existing.toJSON()
            if (json.keys?.p256dh && json.keys?.auth) {
              void savePushSubscriptionAction({
                endpoint: existing.endpoint,
                p256dh: json.keys.p256dh,
                authSecret: json.keys.auth,
                installationId: getInstallationId(),
                deviceLabel: navigator.userAgent.slice(0, 80),
              })
            }
          }
        } catch {
          // ciche sprawdzenie przy wejściu
        }
      }
    }

    void inspectCurrentDevice()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEnable() {
    setBusy(true)
    setDetail(null)
    const res = await subscribeCurrentDevice(publicKey)
    setPushState(res.state)
    setDetail(res.detail ?? null)
    setBusy(false)
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Powiadomienia Push (iOS / Android / Desktop)</h2>
        {showCenterLink ? (
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/notifications" />}>
            Centrum powiadomień →
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Gdy wpadnie nowy lead z formularza / n8n, aplikacja od razu wyśle powiadomienie Web Push na
        zapisane telefony. Na iPhonie (iOS 16.4+) otwórz aplikację bezpośrednio z ikony na ekranie
        początkowym i kliknij przycisk poniżej, aby przyznać zgodę systemową.
      </p>

      {!outboundReady ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200">
          <strong>Serwer nie ma jeszcze skonfigurowanych kluczy VAPID:</strong> ustaw zmienne{" "}
          <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> oraz <code>VAPID_PRIVATE_KEY</code> w Vercel /{" "}
          <code>.env.local</code> i wykonaj redeploy, aby wysyłka na telefon działała.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleEnable()} disabled={busy}>
          {busy
            ? "Włączanie…"
            : pushState === "włączone"
              ? "Odśwież subskrypcję tego urządzenia"
              : "Włącz powiadomienia na tym urządzeniu"}
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
            Zainstaluj aplikację
          </Button>
        ) : null}

        <form action={testAction} className="inline-flex items-center gap-2">
          <Button type="submit" variant="outline" disabled={testPending}>
            {testPending ? "Wysyłanie…" : "Wyślij test na moje urządzenia"}
          </Button>
        </form>
      </div>

      <p className="text-sm text-foreground">{describePushState(pushState, publicKey, detail)}</p>

      {testState.error ? <p className="text-sm text-destructive">{testState.error}</p> : null}
      {testState.message ? (
        <p className="text-sm text-muted-foreground">{testState.message}</p>
      ) : null}
    </section>
  )
}

function describePushState(state: string | null, publicKey: string, detail: string | null) {
  if (state === "wymaga_instalacji_ios") {
    return "Na iPhonie/iPadzie najpierw kliknij Udostępnij w Safari → „Dodaj do ekranu początkowego”, otwórz VoiceLink z ikony na pulpicie i dopiero tam kliknij „Włącz powiadomienia”."
  }
  if (!publicKey.trim()) {
    return "Brak NEXT_PUBLIC_VAPID_PUBLIC_KEY — skonfiguruj klucze VAPID na serwerze, aby zapisać telefon."
  }
  if (state === "nieobsługiwane") {
    return "Ta przeglądarka lub tryb nie obsługuje Web Push (na iOS wymagany iOS 16.4+ i uruchomienie z ekranu początkowego)."
  }
  if (state === "odmowa") {
    return "Zgoda na powiadomienia jest zablokowana. Wejdź w Ustawienia telefonu → Powiadomienia → VoiceLink (lub ustawienia strony w przeglądarce) i włącz powiadomienia."
  }
  if (state === "włączone") {
    return "To urządzenie jest aktywne i zapisane do odbioru powiadomień push."
  }
  if (state === "błąd") {
    return detail
      ? `Nie udało się zapisać powiadomień (${detail}).`
      : "Nie udało się włączyć powiadomień na tym urządzeniu."
  }
  if (state === "brak_klucza") {
    return "Brak klucza publicznego VAPID. Push nie został włączony."
  }
  return "Kliknij „Włącz powiadomienia na tym urządzeniu”, aby powiązać ten telefon lub komputer ze swoim kontem."
}
