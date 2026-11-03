import { describe, expect, it } from "vitest"

import { safeInternalPath } from "@/lib/auth/return-to"

describe("safeInternalPath", () => {
  it("zostawia wewnętrzną ścieżkę z zapytaniem", () => {
    expect(safeInternalPath("/clients/abc?tab=deals")).toBe("/clients/abc?tab=deals")
  })

  it("odrzuca adres zewnętrzny", () => {
    expect(safeInternalPath("https://evil.example/clients")).toBe("/")
  })

  it("odrzuca ścieżkę protocol-relative", () => {
    expect(safeInternalPath("//evil.example")).toBe("/")
  })

  it("odrzuca ukośnik wsteczny", () => {
    expect(safeInternalPath("/\\evil.example")).toBe("/")
  })

  it("nie wraca na ekran logowania", () => {
    expect(safeInternalPath("/login?returnTo=/clients")).toBe("/")
  })

  it("pustą wartość zamienia na start", () => {
    expect(safeInternalPath(null)).toBe("/")
    expect(safeInternalPath("   ")).toBe("/")
  })
})
