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

export function outboundPushConfigured() {
  return (
    previewSideEffectsAllowed() &&
    process.env.ENABLE_OUTBOUND_PUSH === "true" &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
    Boolean(process.env.VAPID_PRIVATE_KEY) &&
    Boolean(process.env.VAPID_SUBJECT)
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

  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

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
