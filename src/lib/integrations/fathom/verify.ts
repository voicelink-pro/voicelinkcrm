import { createHmac, timingSafeEqual } from "node:crypto"

const toleranceSeconds = 300

export type WebhookVerdict =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: "missing" | "timestamp" | "signature" }

export function verifyFathomWebhook(
  secret: string,
  headers: Headers,
  rawBody: string,
  nowSeconds: number,
): WebhookVerdict {
  const id = headers.get("webhook-id")?.trim() ?? ""
  const timestampHeader = headers.get("webhook-timestamp")?.trim() ?? ""
  const signatureHeader = headers.get("webhook-signature")?.trim() ?? ""

  if (!id || !timestampHeader || !signatureHeader || !secret.includes("_")) {
    return { ok: false, reason: "missing" }
  }

  const timestamp = Number(timestampHeader)
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { ok: false, reason: "timestamp" }
  }

  const secretPart = secret.split("_").slice(1).join("_")
  const secretBytes = Buffer.from(secretPart, "base64")
  if (secretBytes.length === 0) {
    return { ok: false, reason: "signature" }
  }

  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${timestampHeader}.${rawBody}`)
    .digest("base64")

  const signatures = signatureHeader.split(" ").map((part) => {
    const pieces = part.split(",")
    return pieces.length > 1 ? pieces.slice(1).join(",") : pieces[0]
  })

  const expectedBuffer = Buffer.from(expected)
  const matches = signatures.some((signature) => {
    const actual = Buffer.from(signature)
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
  })

  return matches ? { ok: true, id, timestamp } : { ok: false, reason: "signature" }
}
