import { describe, expect, it } from "vitest"

import {
  normalizeGoogleCalendarIcalUrl,
  parseIcalFeed,
} from "@/lib/crm/calendar-ical"

describe("kalendarz google ical", () => {
  it("normalizuje link webcal, email oraz link html Google Calendar do adresu .ics", () => {
    expect(
      normalizeGoogleCalendarIcalUrl("webcal://calendar.google.com/calendar/ical/test%40gmail.com/public/basic.ics"),
    ).toBe("https://calendar.google.com/calendar/ical/test%40gmail.com/public/basic.ics")

    expect(normalizeGoogleCalendarIcalUrl("karol.kulis@gmail.com")).toBe(
      "https://calendar.google.com/calendar/ical/karol.kulis%40gmail.com/public/basic.ics",
    )

    expect(
      normalizeGoogleCalendarIcalUrl(
        "https://calendar.google.com/calendar/embed?src=zespol%40voicelink.pl&ctz=Europe%2FWarsaw",
      ),
    ).toBe("https://calendar.google.com/calendar/ical/zespol%40voicelink.pl/public/basic.ics")
  })

  it("parsuje wydarzenia VEVENT z formatu iCal wraz z linkiem Google Meet", () => {
    const sampleIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:evt-123@google.com",
      "SUMMARY:Prezentacja VoiceLink dla AS-Med",
      "DESCRIPTION:Omówienie wdrożenia asystenta głosowego\\nLink: https://meet.google.com/abc-defg-hij",
      "LOCATION:Google Meet",
      "DTSTART:20261103T100000Z",
      "DTEND:20261103T104500Z",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")

    const events = parseIcalFeed(sampleIcs)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      uid: "evt-123@google.com",
      title: "Prezentacja VoiceLink dla AS-Med",
      location: "Google Meet",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      startsAt: "2026-11-03T10:00:00.000Z",
      endsAt: "2026-11-03T10:45:00.000Z",
      allDay: false,
    })
  })
})
