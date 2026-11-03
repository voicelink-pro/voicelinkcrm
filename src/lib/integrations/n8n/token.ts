import { timingSafeEqual } from "node:crypto"

export function bearerToken(header: string | null) {
  if (!header) {
    return null
  }

  const [scheme, value] = header.split(" ")
  if (!scheme || !value || scheme.toLowerCase() !== "bearer" || header.split(" ").length !== 2) {
    return null
  }

  return value
}

export function tokenMatches(presented: string, expected: string) {
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)

  if (left.length !== right.length) {
    timingSafeEqual(right, right)
    return false
  }

  return timingSafeEqual(left, right)
}
