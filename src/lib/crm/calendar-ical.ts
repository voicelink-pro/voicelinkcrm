export type ParsedIcalEvent = {
  uid: string
  title: string
  description: string | null
  location: string | null
  meetingUrl: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
}

function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const unfolded = normalized.replace(/\n[ \t]/g, "")
  return unfolded.split("\n")
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

function parseIcalDate(rawVal: string, params: string): { iso: string; allDay: boolean } | null {
  const val = rawVal.trim()
  if (!val) return null

  const isDateOnly = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(val)
  if (isDateOnly && /^\d{8}/.test(val)) {
    const y = val.slice(0, 4)
    const m = val.slice(4, 6)
    const d = val.slice(6, 8)
    const dt = new Date(`${y}-${m}-${d}T12:00:00.000Z`)
    if (Number.isNaN(dt.getTime())) return null
    return { iso: dt.toISOString(), allDay: true }
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(val)
  if (m) {
    const [, year, month, day, hour, minute, second, isUtc] = m
    if (isUtc) {
      const dt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`)
      if (Number.isNaN(dt.getTime())) return null
      return { iso: dt.toISOString(), allDay: false }
    }

    const tzMatch = /TZID=([^;:]+)/i.exec(params)
    const tzId = tzMatch?.[1]?.trim() || "Europe/Warsaw"
    try {
      const naiveUtc = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      )
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tzId,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(naiveUtc))
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
      const tzHour = get("hour") === 24 ? 0 : get("hour")
      const tzAsUtc = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        tzHour,
        get("minute"),
        get("second"),
      )
      const offsetMs = tzAsUtc - naiveUtc
      const corrected = new Date(naiveUtc - offsetMs)
      if (!Number.isNaN(corrected.getTime())) {
        return { iso: corrected.toISOString(), allDay: false }
      }
    } catch {
      // Nieznane TZID: fallback poniżej
    }

    const dt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
    if (Number.isNaN(dt.getTime())) return null
    return { iso: dt.toISOString(), allDay: false }
  }

  const fallback = new Date(val)
  if (!Number.isNaN(fallback.getTime())) {
    return { iso: fallback.toISOString(), allDay: false }
  }

  return null
}

function extractMeetingLink(text: string): string | null {
  const match =
    /https:\/\/(?:meet\.google\.com\/[a-z-]+|[a-z0-9.-]*zoom\.us\/j\/[^\s<>"]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+)/i.exec(
      text,
    )
  return match ? match[0] : null
}

export function normalizeGoogleCalendarIcalUrl(rawInput: string): string | null {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const normalizedProtocol = trimmed.replace(/^webcal:\/\//i, "https://")

  // Jeśli użytkownik wkleił sam identyfikator e-mail kalendarza (np. jan.kowalski@gmail.com)
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedProtocol) && !normalizedProtocol.includes("/")) {
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(normalizedProtocol)}/public/basic.ics`
  }

  try {
    const url = new URL(normalizedProtocol)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null
    }
    // Jeśli wklejono link HTML z parametrem ?src=... z Google Calendar
    const srcParam = url.searchParams.get("src")
    if (
      url.hostname.includes("calendar.google.com") &&
      !url.pathname.endsWith(".ics") &&
      srcParam
    ) {
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(srcParam)}/public/basic.ics`
    }
    return url.toString()
  } catch {
    return null
  }
}

export function parseIcalFeed(rawIcs: string): ParsedIcalEvent[] {
  const lines = unfoldLines(rawIcs)
  const events: ParsedIcalEvent[] = []

  let inEvent = false
  let uid = ""
  let recurrenceId = ""
  let summary = ""
  let description = ""
  let location = ""
  let urlProp = ""
  let conference = ""
  let status = ""
  let dtStart: { iso: string; allDay: boolean } | null = null
  let dtEnd: { iso: string; allDay: boolean } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true
      uid = ""
      recurrenceId = ""
      summary = ""
      description = ""
      location = ""
      urlProp = ""
      conference = ""
      status = ""
      dtStart = null
      dtEnd = null
      continue
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && dtStart && status.toUpperCase() !== "CANCELLED") {
        const startsAt = dtStart.iso
        const endsAt =
          dtEnd?.iso ??
          new Date(new Date(startsAt).getTime() + (dtStart.allDay ? 86400_000 : 3600_000)).toISOString()
        const cleanDesc = description ? unescapeIcalText(description) : null
        const cleanLoc = location ? unescapeIcalText(location) : null
        const detectedUrl =
          conference ||
          urlProp ||
          extractMeetingLink(`${cleanLoc ?? ""} ${cleanDesc ?? ""}`) ||
          null
        const cleanSummary = summary ? unescapeIcalText(summary) : ""
        const baseUid = uid || `${startsAt}-${cleanSummary || "event"}`
        const finalUid = recurrenceId ? `${baseUid}#${recurrenceId}` : baseUid

        events.push({
          uid: finalUid,
          title: cleanSummary || "Wydarzenie w kalendarzu",
          description: cleanDesc,
          location: cleanLoc,
          meetingUrl: detectedUrl,
          startsAt,
          endsAt,
          allDay: dtStart.allDay,
        })
      }
      inEvent = false
      continue
    }

    if (!inEvent) continue

    const colonIdx = line.indexOf(":")
    if (colonIdx <= 0) continue

    const rawKey = line.slice(0, colonIdx)
    const rawValue = line.slice(colonIdx + 1)
    const [propName, ...paramParts] = rawKey.split(";")
    const prop = (propName ?? "").toUpperCase()
    const params = paramParts.join(";")

    switch (prop) {
      case "UID":
        uid = rawValue.trim()
        break
      case "RECURRENCE-ID":
        recurrenceId = rawValue.trim()
        break
      case "SUMMARY":
        summary = rawValue
        break
      case "DESCRIPTION":
        description = rawValue
        break
      case "LOCATION":
        location = rawValue
        break
      case "URL":
        urlProp = rawValue.trim()
        break
      case "X-GOOGLE-CONFERENCE":
        conference = rawValue.trim()
        break
      case "STATUS":
        status = rawValue.trim()
        break
      case "DTSTART":
        dtStart = parseIcalDate(rawValue, params)
        break
      case "DTEND":
        dtEnd = parseIcalDate(rawValue, params)
        break
    }
  }

  return events
}
