import { describe, expect, it } from "vitest"

import { morningDigestPath } from "@/lib/crm/notification-path"
import { safeInternalPath } from "@/lib/auth/return-to"
import { secretsMatch } from "@/lib/worker/secret"

describe("sekret workera", () => {
  it("uznaje ten sam sekret", () => {
    expect(secretsMatch("przyklad-sekretu", "przyklad-sekretu")).toBe(true)
  })

  it("odrzuca inny sekret o innej długości", () => {
    expect(secretsMatch("krotki", "zupelnie-inny-sekret")).toBe(false)
  })

  it("odrzuca pusty nagłówek", () => {
    expect(secretsMatch("", "przyklad-sekretu")).toBe(false)
  })
})

describe("ścieżka digestu", () => {
  it("zostaje wewnętrzną ścieżką zadań na dziś", () => {
    expect(safeInternalPath(morningDigestPath)).toBe("/tasks?view=today&assignee=me")
  })
})
