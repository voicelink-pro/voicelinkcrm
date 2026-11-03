const FALLBACK_PATH = "/"

export function firstSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export function safeInternalPath(
  input: string | null | undefined,
  fallback = FALLBACK_PATH,
) {
  if (typeof input !== "string") {
    return fallback
  }

  const value = input.trim()

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return fallback
  }

  let url: URL

  try {
    url = new URL(value, "http://voicelink.internal")
  } catch {
    return fallback
  }

  if (url.origin !== "http://voicelink.internal" || url.username || url.password) {
    return fallback
  }

  const path = `${url.pathname}${url.search}`

  if (
    path.startsWith("/login") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/auth")
  ) {
    return fallback
  }

  return path
}
