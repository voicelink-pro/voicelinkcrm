const hits = new Map<string, number[]>()

export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)

  if (recent.length >= limit) {
    hits.set(key, recent)
    const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000))
    return { allowed: false, retryAfter }
  }

  recent.push(now)
  hits.set(key, recent)
  return { allowed: true, retryAfter: 0 }
}

export function resetRateLimit() {
  hits.clear()
}
