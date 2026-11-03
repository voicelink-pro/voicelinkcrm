import { createHash } from "node:crypto"

import { fathomMeetingSchema } from "@/lib/integrations/fathom/contract"
import { normalizeFathomMeeting } from "@/lib/integrations/fathom/normalize"
import { fathomWebhookSecret } from "@/lib/integrations/fathom/secrets"
import {
  acceptFathomDelivery,
  finishFathomDelivery,
  getFathomConnection,
  upsertFathomMeeting,
} from "@/lib/integrations/fathom/store"
import { verifyFathomWebhook } from "@/lib/integrations/fathom/verify"
import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"

export const dynamic = "force-dynamic"

const maxBodyBytes = 1_500_000

export async function POST(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  if (!previewSideEffectsAllowed()) {
    return json(503, "preview_disabled", "Odbiór Fathoma na preview jest wyłączony.")
  }

  const { connectionId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
    return json(404, "not_found", "Nie znaleziono połączenia.")
  }

  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return json(413, "payload_too_large", "Treść żądania jest za duża.")
  }

  let raw = ""
  try {
    raw = await request.text()
  } catch {
    return json(503, "unavailable", "Nie udało się odczytać żądania.")
  }

  if (Buffer.byteLength(raw) > maxBodyBytes) {
    return json(413, "payload_too_large", "Treść żądania jest za duża.")
  }

  const connection = await getFathomConnection(connectionId)
  if (!connection) {
    return json(404, "not_found", "Nie znaleziono połączenia.")
  }

  const secret = fathomWebhookSecret(connection.secretRef)
  if (!secret) {
    return json(503, "integration_unconfigured", "Sekret webhooka nie jest ustawiony na serwerze.")
  }

  const verdict = verifyFathomWebhook(secret, request.headers, raw, Math.floor(Date.now() / 1000))
  if (!verdict.ok) {
    const reason = verdict.reason === "timestamp" ? "stale_timestamp" : "bad_signature"
    return json(401, reason, "Podpis webhooka nie został przyjęty.")
  }

  let jsonBody: unknown
  try {
    jsonBody = JSON.parse(raw)
  } catch {
    return json(422, "invalid_payload", "Treść nie jest poprawnym JSON.")
  }

  const parsed = fathomMeetingSchema.safeParse(jsonBody)
  const meeting = parsed.success ? normalizeFathomMeeting(parsed.data) : null
  if (!meeting) {
    return json(422, "invalid_payload", "Zdarzenie nie zawiera identyfikatora nagrania i czasu rozpoczęcia.")
  }

  let accepted: { state: string; job_id?: string } | null
  try {
    const stored = await acceptFathomDelivery(
      connection.id,
      verdict.id,
      createHash("sha256").update(raw).digest("hex"),
      meeting.recordingId,
      meeting,
    )
    if (stored.message || !stored.data) {
      return json(503, "unavailable", "Zapis zdarzenia jest chwilowo niedostępny.")
    }
    accepted = stored.data
  } catch {
    return json(503, "unavailable", "Zapis zdarzenia jest chwilowo niedostępny.")
  }

  if (accepted.state === "duplicate" || accepted.state === "ignored") {
    return Response.json({ status: accepted.state })
  }

  if (accepted.state !== "accepted" || !accepted.job_id) {
    return json(503, "unavailable", "Zdarzenie nie zostało przyjęte do pracy.")
  }

  const applied = await upsertFathomMeeting(connection.id, meeting, null)
  const finished = await finishFathomDelivery(
    verdict.id,
    accepted.job_id,
    !applied.message,
    applied.message,
  )
  if (applied.message || finished.message) {
    return json(503, "unavailable", "Spotkanie nie zostało zapisane. Dostawca może ponowić zdarzenie.")
  }

  return Response.json({ status: "accepted" })
}

function json(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status })
}
