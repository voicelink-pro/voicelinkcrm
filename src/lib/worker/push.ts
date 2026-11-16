import "server-only"

import webpush from "web-push"

import { safeInternalPath } from "@/lib/auth/return-to"
import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"

export type PushAttempt = {
  ok: boolean
  gone: boolean
  code: number | null
  error: string | null
}

const DEFAULT_VAPID_SUBJECT = "mailto:powiadomienia@voicelink.pl"

export function publicVapidKey() {
  return (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    ""
  )
}

function vapidSubject() {
  const configured = process.env.VAPID_SUBJECT?.trim()
  if (configured && (configured.startsWith("mailto:") || configured.startsWith("https://"))) {
    return configured
  }
  return DEFAULT_VAPID_SUBJECT
}

export function outboundPushConfigured() {
  return (
    previewSideEffectsAllowed() &&
    process.env.ENABLE_OUTBOUND_PUSH !== "false" &&
    Boolean(publicVapidKey()) &&
    Boolean(process.env.VAPID_PRIVATE_KEY?.trim())
  )
}

export async function deliverPush(input: {
  endpoint: string
  p256dh: string
  authSecret: string
  title: string
  body: string
  targetPath: string | null
}): Promise<PushAttempt> {
  if (!outboundPushConfigured()) {
    return { ok: false, gone: false, code: null, error: "vapid_absent" }
  }

  const subject = vapidSubject()
  const publicKey = publicVapidKey()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()

  if (!subject || !publicKey || !privateKey) {
    return { ok: false, gone: false, code: null, error: "vapid_absent" }
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  try {
    await webpush.sendNotification(
      {
        endpoint: input.endpoint,
        keys: { p256dh: input.p256dh, auth: input.authSecret },
      },
      JSON.stringify({
        title: input.title.slice(0, 80),
        body: input.body.slice(0, 140),
        url: safeInternalPath(input.targetPath, "/notifications"),
      }),
      {
        TTL: 86400,
        urgency: "high",
      },
    )
    return { ok: true, gone: false, code: 201, error: null }
  } catch (error) {
    const status =
      typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : null
    const gone = status === 404 || status === 410
    return { ok: false, gone, code: Number.isFinite(status) ? status : null, error: gone ? "gone" : "push_failed" }
  }
}
