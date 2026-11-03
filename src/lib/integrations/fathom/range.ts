export function warsawMidnightIso(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  const utcMidnight = new Date(Date.UTC(year, month - 1, date))
  const offset = warsawOffsetMinutes(utcMidnight)
  return new Date(utcMidnight.getTime() - offset * 60_000).toISOString()
}

export function nextCalendarDay(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, date))
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function warsawOffsetMinutes(instant: Date) {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Warsaw",
      timeZoneName: "longOffset",
      hour: "2-digit",
    })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+0"
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
  if (!match) {
    return 0
  }
  const sign = match[1] === "-" ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
}
