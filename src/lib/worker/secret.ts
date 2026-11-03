import { createHash, timingSafeEqual } from "node:crypto"

export function secretsMatch(provided: string, expected: string) {
  const left = createHash("sha256").update(provided).digest()
  const right = createHash("sha256").update(expected).digest()
  return timingSafeEqual(left, right)
}
