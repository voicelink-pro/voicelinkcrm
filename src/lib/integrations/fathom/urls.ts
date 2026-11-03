export function fathomRecordingUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null
  }

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (host !== "fathom.video" && !host.endsWith(".fathom.video")) {
    return null
  }

  url.hostname = host
  return url.toString()
}
