import "server-only"

import type { z } from "zod"

import {
  extractApiKeyFromHeaders,
  hashApiKey,
  looksLikeApiKey,
} from "@/lib/api/keys"
import { polishDatabaseError } from "@/lib/database/errors"
import { takeRateLimit } from "@/lib/integrations/n8n/rate-limit"
import { createCorrelationId } from "@/lib/observability/correlation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"

const MAX_BODY_BYTES = 262_144 // 256 KB
const RATE_LIMIT_PER_MIN = 180
const RATE_WINDOW_MS = 60_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ApiAuthContext = {
  keyId: string
  keyName: string
  keyPrefix: string
  workspaceId: string
  actorUserId: string
  actorName: string
  actorRole: "admin" | "member"
}

export type AuthResult =
  | { ok: true; auth: ApiAuthContext; correlationId: string }
  | { ok: false; response: Response }

type RpcName = keyof Database["private"]["Functions"]

const DEFAULT_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value))
}

export function apiOk<T>(
  data: T,
  correlationId: string,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  return Response.json(
    { data, correlation_id: correlationId },
    {
      status,
      headers: {
        ...DEFAULT_HEADERS,
        "x-correlation-id": correlationId,
        ...extraHeaders,
      },
    },
  )
}

export function apiList<T>(
  items: T[],
  meta: { total: number; limit: number; offset: number },
  correlationId: string,
) {
  return Response.json(
    { data: items, meta, correlation_id: correlationId },
    {
      status: 200,
      headers: {
        ...DEFAULT_HEADERS,
        "x-correlation-id": correlationId,
      },
    },
  )
}

export function apiError(
  status: number,
  code: string,
  message: string,
  correlationId: string,
  details?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      correlation_id: correlationId,
    },
    {
      status,
      headers: {
        ...DEFAULT_HEADERS,
        "x-correlation-id": correlationId,
        ...extraHeaders,
      },
    },
  )
}

export async function authenticateApiRequest(request: Request): Promise<AuthResult> {
  const correlationId = createCorrelationId()
  const rawKey = extractApiKeyFromHeaders(request.headers)

  if (!looksLikeApiKey(rawKey)) {
    return {
      ok: false,
      response: apiError(
        401,
        "unauthorized",
        "Brak prawidłowego klucza API. Przekaż nagłówek Authorization: Bearer <klucz> lub X-API-Key.",
        correlationId,
      ),
    }
  }

  const keyHash = hashApiKey(rawKey)
  const limit = takeRateLimit(`api:${keyHash}`, RATE_LIMIT_PER_MIN, RATE_WINDOW_MS)
  if (!limit.allowed) {
    return {
      ok: false,
      response: apiError(
        429,
        "rate_limited",
        "Przekroczono limit żądań dla tego klucza API.",
        correlationId,
        { retry_after_seconds: limit.retryAfter },
        { "Retry-After": String(limit.retryAfter) },
      ),
    }
  }

  try {
    const admin = createAdminClient()
    const { data: keyRow, error } = await admin
      .from("api_keys")
      .select(
        "id, workspace_id, owner_user_id, name, key_prefix, expires_at, revoked_at, request_count",
      )
      .eq("key_hash", keyHash)
      .maybeSingle()

    if (error) {
      return {
        ok: false,
        response: apiError(
          503,
          "unavailable",
          "Weryfikacja klucza API jest chwilowo niedostępna.",
          correlationId,
        ),
      }
    }

    if (!keyRow || keyRow.revoked_at) {
      return {
        ok: false,
        response: apiError(
          401,
          "unauthorized",
          "Klucz API jest nieprawidłowy lub został unieważniony.",
          correlationId,
        ),
      }
    }

    if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) {
      return {
        ok: false,
        response: apiError(
          401,
          "key_expired",
          "Klucz API wygasł. Wygeneruj nowy klucz w Ustawieniach CRM.",
          correlationId,
        ),
      }
    }

    const [{ data: member }, { data: profile }] = await Promise.all([
      admin
        .from("workspace_members")
        .select("role, active")
        .eq("workspace_id", keyRow.workspace_id)
        .eq("user_id", keyRow.owner_user_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name")
        .eq("workspace_id", keyRow.workspace_id)
        .eq("user_id", keyRow.owner_user_id)
        .maybeSingle(),
    ])

    if (!member || !member.active) {
      return {
        ok: false,
        response: apiError(
          403,
          "member_inactive",
          "Członek zespołu powiązany z tym kluczem API nie ma aktywnego dostępu do CRM.",
          correlationId,
        ),
      }
    }

    // Best-effort statystyka ostatniego użycia
    void admin
      .from("api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        request_count: (keyRow.request_count ?? 0) + 1,
      })
      .eq("id", keyRow.id)
      .then(() => undefined, () => undefined)

    return {
      ok: true,
      correlationId,
      auth: {
        keyId: keyRow.id,
        keyName: keyRow.name,
        keyPrefix: keyRow.key_prefix,
        workspaceId: keyRow.workspace_id,
        actorUserId: keyRow.owner_user_id,
        actorName: profile?.full_name ?? "Użytkownik",
        actorRole: member.role === "admin" ? "admin" : "member",
      },
    }
  } catch {
    return {
      ok: false,
      response: apiError(
        503,
        "unavailable",
        "Weryfikacja klucza API jest chwilowo niedostępna.",
        correlationId,
      ),
    }
  }
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  correlationId: string,
): Promise<{ ok: true; data: z.output<T> } | { ok: false; response: Response }> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError(413, "payload_too_large", "Treść żądania przekracza limit 256 KB.", correlationId),
    }
  }

  let raw = ""
  try {
    raw = await request.text()
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_body", "Nie udało się odczytać treści żądania.", correlationId),
    }
  }

  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError(413, "payload_too_large", "Treść żądania przekracza limit 256 KB.", correlationId),
    }
  }

  let parsedJson: unknown
  try {
    parsedJson = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_json", "Treść żądania nie jest poprawnym JSON.", correlationId),
    }
  }

  const parsed = schema.safeParse(parsedJson)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const path = issue.path.length ? issue.path.join(".") : "body"
      if (!fields[path]) {
        fields[path] = issue.message
      }
    }
    return {
      ok: false,
      response: apiError(
        422,
        "validation_error",
        "Dane wejściowe nie spełniają wymagań walidacji.",
        correlationId,
        { fields },
      ),
    }
  }

  return { ok: true, data: parsed.data }
}

const KNOWN_DB_CODES: Record<string, { status: number; code: string }> = {
  not_found: { status: 404, code: "not_found" },
  version_conflict: { status: 409, code: "version_conflict" },
  idempotency_conflict: { status: 409, code: "idempotency_conflict" },
  finalization_conflict: { status: 409, code: "finalization_conflict" },
  not_a_member: { status: 403, code: "forbidden" },
  invalid_state: { status: 422, code: "invalid_state" },
  invalid_contact: { status: 422, code: "invalid_contact" },
  cross_reference: { status: 422, code: "cross_reference" },
  follow_up_date_required: { status: 422, code: "follow_up_date_required" },
  finalization_required: { status: 422, code: "finalization_required" },
  invalid_billing_date: { status: 422, code: "invalid_billing_date" },
  billing_horizon_exceeded: { status: 422, code: "billing_horizon_exceeded" },
}

export function extractDbErrorCode(message: string | null | undefined): string | null {
  const text = message?.trim() ?? ""
  if (!text) return null
  for (const key of Object.keys(KNOWN_DB_CODES)) {
    if (
      text === key ||
      text.endsWith(`: ${key}`) ||
      text.endsWith(`:${key}`) ||
      text.includes(` ${key}`)
    ) {
      return key
    }
  }
  return null
}

export function mapRpcError(
  error: { message?: string | null } | null | undefined,
  correlationId: string,
): Response {
  const dbCode = extractDbErrorCode(error?.message)
  const mapped = dbCode ? KNOWN_DB_CODES[dbCode] : null
  return apiError(
    mapped?.status ?? 500,
    mapped?.code ?? "database_error",
    polishDatabaseError(error),
    correlationId,
  )
}

export async function callAgentRpc<T>(
  name: RpcName,
  args: Record<string, unknown>,
  correlationId: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.schema("private").rpc(name, args as never)
    if (error) {
      return { ok: false, response: mapRpcError(error, correlationId) }
    }
    return { ok: true, data: data as T }
  } catch {
    return {
      ok: false,
      response: apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId),
    }
  }
}

export function parsePagination(searchParams: URLSearchParams) {
  const rawLimit = Number(searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(200, Math.max(1, Math.trunc(rawLimit)))
    : 50

  const rawPage = searchParams.get("page")
  const rawOffset = searchParams.get("offset")

  let offset = 0
  if (rawOffset !== null && rawOffset !== "") {
    const parsed = Number(rawOffset)
    offset = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
  } else if (rawPage !== null && rawPage !== "") {
    const page = Number(rawPage)
    offset = Number.isFinite(page) && page > 1 ? (Math.trunc(page) - 1) * limit : 0
  }

  return { limit, offset }
}

export function searchPattern(value: string | null | undefined) {
  if (!value) return null
  const cleaned = value.replace(/[%_,.*()"\\]/g, " ").replace(/\s+/g, " ").trim()
  return cleaned ? `%${cleaned}%` : null
}

export function quoted(pattern: string) {
  return `"${pattern.replaceAll('"', "")}"`
}

export function extractWarsawTimeFromDueAt(dueAt: string | null): string | null {
  if (!dueAt) return null
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(dueAt))
    return /^\d{2}:\d{2}$/.test(formatted) ? formatted : null
  } catch {
    return null
  }
}
