"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function PwaRegister() {
  const router = useRouter()

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((reg) => reg.update())
      .catch(() => undefined)

    function onMessage(event: MessageEvent) {
      const payload = event.data as
        | { type?: string; title?: string; body?: string; url?: string }
        | undefined
      if (!payload || payload.type !== "VOICELINK_PUSH") {
        return
      }

      const targetUrl =
        typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : null

      toast(payload.title || "Nowe powiadomienie VoiceLink", {
        description: payload.body || undefined,
        action: targetUrl
          ? {
              label: "Otwórz",
              onClick: () => router.push(targetUrl),
            }
          : undefined,
      })
      router.refresh()
    }

    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [router])

  return null
}
