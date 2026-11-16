const money = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
})

const dateTime = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
})

const day = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeZone: "Europe/Warsaw",
})

export function formatGrosze(cents: number | null | undefined) {
  if (cents == null) {
    return "Nie uzupełniono"
  }

  return money.format(cents / 100)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Nie uzupełniono"
  }

  return dateTime.format(new Date(value))
}

export function formatDay(value: string | null | undefined) {
  if (!value) {
    return "Nie uzupełniono"
  }

  return day.format(new Date(`${value.slice(0, 10)}T12:00:00+01:00`))
}

export function formatPhone(value: string | null | undefined) {
  if (!value) {
    return ""
  }

  const compact = value.replace(/[^\d+]/g, "")
  if (/^\+48\d{9}$/.test(compact)) {
    return `+48 ${compact.slice(3, 6)} ${compact.slice(6, 9)} ${compact.slice(9)}`
  }

  return value.trim()
}
