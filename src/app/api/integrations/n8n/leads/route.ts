import { createHash } from "node:crypto"

import { createCorrelationId } from "@/lib/observability/correlation"
import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"
import { readN8nConfig } from "@/lib/integrations/n8n/config"
import { payloadHash } from "@/lib/integrations/n8n/hash"
import { takeRateLimit } from "@/lib/integrations/n8n/rate-limit"
import {
  importHttpStatus,
  publicImportBody,
  readImportResult,
} from "@/lib/integrations/n8n/response"
import { n8nLeadSchema } from "@/lib/integrations/n8n/schema"
import { bearerToken, tokenMatches } from "@/lib/integrations/n8n/token"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const SECRET_REF = "env:N8N_LEADS_WEBHOOK_TOKEN"
const PROVIDER = "n8n_leads"

export async function POST(request: Request) {
  const correlationId = createCorrelationId()

  if (!previewSideEffectsAllowed()) {
    return errorResponse(
      503,
      "preview_disabled",
      "Odbiór leadów na preview jest wyłączony.",
      correlationId,
    )
  }

  const config = readN8nConfig()

  if (!config) {
    return errorResponse(503, "integration_unconfigured", "Integracja nie jest skonfigurowana.", correlationId)
  }

  const limit = takeRateLimit(clientKey(request), config.rateLimit, config.windowMs)
  if (!limit.allowed) {
    return errorResponse(429, "rate_limited", "Za dużo żądań. Spróbuj ponownie później.", correlationId, {
      "Retry-After": String(limit.retryAfter),
    })
  }

  const presented = bearerToken(request.headers.get("authorization"))
  if (!presented || !tokenMatches(presented, config.token)) {
    return errorResponse(401, "unauthorized", "Nieprawidłowy token.", correlationId)
  }

  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > config.maxBodyBytes) {
    return errorResponse(413, "payload_too_large", "Treść żądania jest za duża.", correlationId)
  }

  let raw = ""
  try {
    raw = await request.text()
  } catch {
    return errorResponse(503, "unavailable", "Nie udało się odczytać żądania.", correlationId)
  }

  if (Buffer.byteLength(raw) > config.maxBodyBytes) {
    return errorResponse(413, "payload_too_large", "Treść żądania jest za duża.", correlationId)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return errorResponse(422, "invalid_payload", "Treść nie jest poprawnym JSON.", correlationId)
  }

  const parsed = n8nLeadSchema.safeParse(json)
  if (!parsed.success) {
    return errorResponse(422, "invalid_payload", "Zgłoszenie nie pasuje do kontraktu v1.", correlationId)
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? ""
  if (!idempotencyKey || idempotencyKey !== parsed.data.event_id) {
    return errorResponse(
      422,
      "invalid_payload",
      "Idempotency-Key musi być taki sam jak event_id.",
      correlationId,
    )
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.schema("private").rpc("import_lead", {
      p_workspace_id: config.workspaceId,
      p_event_id: parsed.data.event_id,
      p_source: parsed.data.source,
      p_source_record_id: parsed.data.source_record_id,
      p_payload_hash: payloadHash(parsed.data),
      p_full_name: parsed.data.contact.full_name,
      p_email: parsed.data.contact.email,
      p_phone: parsed.data.contact.phone,
      p_is_test: parsed.data.is_test,
    })

    if (error) {
      const code = databaseCode(error.message)
      await noteReceipt(config.workspaceId, false, code ?? "unavailable")
      if (code === "idempotency_conflict") {
        return errorResponse(
          409,
          "idempotency_conflict",
          "To zgłoszenie zostało już zapisane z inną treścią.",
          correlationId,
        )
      }
      if (code === "import_invalid") {
        return errorResponse(422, "invalid_payload", "Identyfikatory zgłoszenia są niepoprawne.", correlationId)
      }
      return errorResponse(503, "unavailable", "Zapis jest chwilowo niedostępny.", correlationId)
    }

    const result = readImportResult(data)
    await noteReceipt(config.workspaceId, true, "")
    return Response.json(publicImportBody(result, parsed.data.event_id, correlationId), {
      status: importHttpStatus(result),
      headers: { "x-correlation-id": correlationId },
    })
  } catch {
    return errorResponse(503, "unavailable", "Zapis jest chwilowo niedostępny.", correlationId)
  }
}

async function noteReceipt(workspaceId: string, ok: boolean, errorCode: string) {
  try {
    const admin = createAdminClient()
    await admin.schema("private").rpc("note_integration_receipt", {
      p_workspace_id: workspaceId,
      p_provider: PROVIDER,
      p_secret_ref: SECRET_REF,
      p_ok: ok,
      p_error: errorCode,
    })
  } catch {
    // Brak śladu odbioru nie cofa już zapisanego leada.
  }
}

function databaseCode(message: string) {
  for (const code of ["idempotency_conflict", "import_invalid", "not_found"] as const) {
    if (message.includes(code)) {
      return code
    }
  }
  return null
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const address = forwarded || "local"
  return createHash("sha256").update(address).digest("hex")
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  correlationId: string,
  extra?: Record<string, string>,
) {
  return Response.json(
    { code, message, correlation_id: correlationId },
    {
      status,
      headers: { "x-correlation-id": correlationId, ...extra },
    },
  )
}
