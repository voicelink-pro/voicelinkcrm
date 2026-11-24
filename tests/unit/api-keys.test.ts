import { describe, expect, it } from "vitest"

import {
  API_KEY_PREFIX,
  extractApiKeyFromHeaders,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
} from "@/lib/api/keys"

describe("API keys helpers", () => {
  it("generates unique prefixed keys with matching SHA-256 hash", () => {
    const first = generateApiKey()
    const second = generateApiKey()

    expect(first.rawKey.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(first.keyPrefix).toBe(first.rawKey.slice(0, API_KEY_PREFIX.length + 8))
    expect(first.keyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.keyHash).toBe(hashApiKey(first.rawKey))
    expect(looksLikeApiKey(first.rawKey)).toBe(true)

    expect(first.rawKey).not.toBe(second.rawKey)
    expect(first.keyHash).not.toBe(second.keyHash)
  })

  it("validates key format strictly", () => {
    expect(looksLikeApiKey(null)).toBe(false)
    expect(looksLikeApiKey("")).toBe(false)
    expect(looksLikeApiKey("vlc_live_short")).toBe(false)
    expect(looksLikeApiKey("wrong_prefix_1234567890123456789012345")).toBe(false)
    expect(looksLikeApiKey("vlc_live_invalid space 12345678901234567890")).toBe(false)
  })

  it("extracts key from Authorization Bearer or X-API-Key header", () => {
    const { rawKey } = generateApiKey()

    const bearerHeaders = new Headers({ Authorization: `Bearer ${rawKey}` })
    expect(extractApiKeyFromHeaders(bearerHeaders)).toBe(rawKey)

    const lowerBearer = new Headers({ authorization: `bearer   ${rawKey}  ` })
    expect(extractApiKeyFromHeaders(lowerBearer)).toBe(rawKey)

    const xKeyHeaders = new Headers({ "X-API-Key": rawKey })
    expect(extractApiKeyFromHeaders(xKeyHeaders)).toBe(rawKey)

    const emptyHeaders = new Headers()
    expect(extractApiKeyFromHeaders(emptyHeaders)).toBeNull()
  })
})
