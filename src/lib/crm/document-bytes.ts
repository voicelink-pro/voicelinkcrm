const bannedMime = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-dosexec",
  "application/x-sh",
])

export function mimeIsAllowed(mime: string, allowed: readonly string[]) {
  const value = mime.trim().toLowerCase()
  if (!value || bannedMime.has(value) || value.includes("svg") || value.startsWith("text/html")) {
    return false
  }
  return allowed.includes(value)
}

function startsWith(prefix: Uint8Array, bytes: number[]) {
  if (prefix.length < bytes.length) return false
  return bytes.every((byte, index) => prefix[index] === byte)
}

function latin1(prefix: Uint8Array) {
  return Array.from(prefix, (byte) => String.fromCharCode(byte)).join("")
}

function looksLikeHtml(prefix: Uint8Array) {
  const text = latin1(prefix).trimStart().slice(0, 80).toLowerCase()
  return (
    text.startsWith("<html") ||
    text.startsWith("<svg") ||
    text.startsWith("<script") ||
    text.startsWith("<!doctype html")
  )
}

function isZip(prefix: Uint8Array) {
  return startsWith(prefix, [0x50, 0x4b, 0x03, 0x04])
}

export function matchesDeclaredMime(mime: string, prefix: Uint8Array) {
  const value = mime.trim().toLowerCase()
  if (startsWith(prefix, [0x4d, 0x5a]) || startsWith(prefix, [0x7f, 0x45, 0x4c, 0x46])) {
    return false
  }

  if (value === "application/pdf") {
    return latin1(prefix).startsWith("%PDF-")
  }

  if (value === "image/png") {
    return startsWith(prefix, [0x89, 0x50, 0x4e, 0x47])
  }

  if (value === "image/jpeg") {
    return startsWith(prefix, [0xff, 0xd8, 0xff])
  }

  if (value === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return isZip(prefix) && latin1(prefix).includes("word/")
  }

  if (value === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return isZip(prefix) && latin1(prefix).includes("xl/")
  }

  if (value === "text/plain") {
    return !prefix.includes(0) && !looksLikeHtml(prefix)
  }

  return false
}
