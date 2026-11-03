import { describe, expect, it } from "vitest"

import { n8nTokenConfigured, readN8nConfig } from "@/lib/integrations/n8n/config"
import { payloadHash } from "@/lib/integrations/n8n/hash"
import { resetRateLimit, takeRateLimit } from "@/lib/integrations/n8n/rate-limit"
import { importHttpStatus, publicImportBody } from "@/lib/integrations/n8n/response"
import { n8nLeadSchema } from "@/lib/integrations/n8n/schema"
import { tokenMatches } from "@/lib/integrations/n8n/token"

const sample = {
  schema_version: 1 as const,
  event_id: "evt-1",
  source: "google_sheets_form",
  source_record_id: "row-1",
  lead_status: "QUALIFIED",
  contact: {
    full_name: "Anna Przykładowa",
    email: "anna@example.com",
    phone: "p:+48500100200",
    extra: "ignored",
  },
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

describe("kontrakt leada n8n", () => {
  it("usuwa nieznane pola i liczy stały skrót", () => {
    const parsed = n8nLeadSchema.parse(sample)
    expect(parsed).not.toHaveProperty("lead_status")
    expect(parsed.contact).not.toHaveProperty("extra")
    expect(parsed.is_test).toBe(false)
    expect(payloadHash(parsed)).toBe(payloadHash(parsed))
    expect(payloadHash({ ...parsed, is_test: true })).not.toBe(payloadHash(parsed))
  })

  it("odrzuca złą wersję schematu", () => {
    expect(n8nLeadSchema.safeParse({ ...sample, schema_version: 2 }).success).toBe(false)
  })

  it("mapuje wynik importu na kod HTTP bez pól kontaktu", () => {
    expect(importHttpStatus({ status: "created" })).toBe(201)
    expect(importHttpStatus({ status: "created", replayed: true })).toBe(200)
    expect(importHttpStatus({ status: "duplicate" })).toBe(200)
    expect(importHttpStatus({ status: "ignored_test" })).toBe(200)
    expect(importHttpStatus({ status: "review" })).toBe(202)
    expect(importHttpStatus({ status: "invalid" })).toBe(202)

    const body = publicImportBody(
      { status: "invalid", deal_id: "deal", review_id: "review" },
      "evt-1",
      "corr",
    )
    expect(body.status).toBe("review")
    expect(body.lead_id).toBe("deal")
    expect(body).not.toHaveProperty("replayed")
    expect(JSON.stringify(body)).not.toContain("anna@example.com")
  })

  it("porównuje token bez zgody na inną długość", () => {
    expect(tokenMatches("secret-token", "secret-token")).toBe(true)
    expect(tokenMatches("secret-token", "secret-tokem")).toBe(false)
    expect(tokenMatches("short", "secret-token")).toBe(false)
  })

  it("nie startuje bez tokenu albo workspace", () => {
    const savedToken = process.env.N8N_LEADS_WEBHOOK_TOKEN
    const savedWorkspace = process.env.N8N_LEADS_WORKSPACE_ID

    delete process.env.N8N_LEADS_WEBHOOK_TOKEN
    process.env.N8N_LEADS_WORKSPACE_ID = "10000000-0000-4000-8000-000000000001"
    expect(readN8nConfig()).toBeNull()
    expect(n8nTokenConfigured()).toBe(false)

    process.env.N8N_LEADS_WEBHOOK_TOKEN = "local-test-token"
    delete process.env.N8N_LEADS_WORKSPACE_ID
    expect(readN8nConfig()).toBeNull()

    restoreEnv("N8N_LEADS_WEBHOOK_TOKEN", savedToken)
    restoreEnv("N8N_LEADS_WORKSPACE_ID", savedWorkspace)
  })

  it("ogranicza serię żądań i zwalnia okno", () => {
    resetRateLimit()
    expect(takeRateLimit("ip", 2, 60_000, 1_000).allowed).toBe(true)
    expect(takeRateLimit("ip", 2, 60_000, 1_100).allowed).toBe(true)
    const blocked = takeRateLimit("ip", 2, 60_000, 1_200)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(takeRateLimit("ip", 2, 60_000, 61_000).allowed).toBe(true)
  })
})
