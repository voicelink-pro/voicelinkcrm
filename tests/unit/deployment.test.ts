import { describe, expect, it } from "vitest"

import { deploymentTarget, previewSideEffectsAllowed } from "@/lib/runtime/deployment"

describe("środowisko wdrożenia", () => {
  it("traktuje brak VERCEL_ENV jako development", () => {
    expect(deploymentTarget({})).toBe("development")
    expect(previewSideEffectsAllowed({})).toBe(true)
  })

  it("pozwala produkcji działać bez dodatkowej flagi preview", () => {
    const env = { VERCEL_ENV: "production", ENABLE_PREVIEW_SIDE_EFFECTS: "" }
    expect(deploymentTarget(env)).toBe("production")
    expect(previewSideEffectsAllowed(env)).toBe(true)
  })

  it("blokuje preview, dopóki flaga nie jest jawnie włączona", () => {
    expect(previewSideEffectsAllowed({ VERCEL_ENV: "preview" })).toBe(false)
    expect(previewSideEffectsAllowed({ VERCEL_ENV: "preview", ENABLE_PREVIEW_SIDE_EFFECTS: "false" })).toBe(false)
    expect(previewSideEffectsAllowed({ VERCEL_ENV: "preview", ENABLE_PREVIEW_SIDE_EFFECTS: "true" })).toBe(true)
  })
})
