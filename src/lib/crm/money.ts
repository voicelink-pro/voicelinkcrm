export function parseGrosze(value: string) {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".")

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null
  }

  const [whole, fraction = ""] = cleaned.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))

  if (!Number.isSafeInteger(cents)) {
    return null
  }

  return cents
}

export function groszeInput(cents: number | null | undefined) {
  if (cents == null || cents < 0) {
    return ""
  }

  const whole = Math.trunc(cents / 100)
  const fraction = cents % 100

  if (fraction === 0) {
    return String(whole)
  }

  return `${whole},${String(fraction).padStart(2, "0")}`
}
