import { createHash, randomBytes } from "node:crypto"

export const API_KEY_PREFIX = "vlc_live_"

export type GeneratedApiKey = {
  rawKey: string
  keyPrefix: string
  keyHash: string
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url")
  const rawKey = `${API_KEY_PREFIX}${secret}`
  const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8)
  const keyHash = hashApiKey(rawKey)
  return { rawKey, keyPrefix, keyHash }
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim()).digest("hex")
}

export function looksLikeApiKey(token: string | null | undefined): token is string {
  if (!token) return false
  const trimmed = token.trim()
  return (
    trimmed.startsWith(API_KEY_PREFIX) &&
    trimmed.length >= API_KEY_PREFIX.length + 24 &&
    trimmed.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(trimmed)
  )
}

export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization") ?? ""
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  const xApiKey = headers.get("x-api-key")?.trim()
  if (xApiKey) {
    return xApiKey
  }

  return null
}
