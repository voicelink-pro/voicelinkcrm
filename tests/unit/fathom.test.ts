import { describe, expect, it } from "vitest"

import {
  FathomRequestError,
  listOwnMeetings,
  type FathomTransport,
} from "@/lib/integrations/fathom/client"
import { normalizeFathomMeeting } from "@/lib/integrations/fathom/normalize"
import { fathomRecordingUrl } from "@/lib/integrations/fathom/urls"
import { verifyFathomWebhook } from "@/lib/integrations/fathom/verify"
import { nextCalendarDay, warsawMidnightIso } from "@/lib/integrations/fathom/range"

const secret = "whsec_5WbX5kEWLlfzsGNjH64I8lOOqUB6e8FH"
const body = "{\"recording_id\":1}"
const signature = "lEVTqmbMuuAl2TYOu0AsEFrPzwCAKDoeORRmHBNbRos="

function headers(values: Record<string, string>) {
  return new Headers(values)
}

describe("weryfikacja webhooka Fathom", () => {
  it("przyjmuje podpis liczony z surowego body", () => {
    const verdict = verifyFathomWebhook(
      secret,
      headers({
        "webhook-id": "msg_test",
        "webhook-timestamp": "1712345678",
        "webhook-signature": `v1,${signature}`,
      }),
      body,
      1712345678,
    )
    expect(verdict.ok).toBe(true)
  })

  it("odrzuca inny podpis i stary znacznik czasu", () => {
    const bad = verifyFathomWebhook(
      secret,
      headers({
        "webhook-id": "msg_test",
        "webhook-timestamp": "1712345678",
        "webhook-signature": "v1,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=",
      }),
      body,
      1712345678,
    )
    const stale = verifyFathomWebhook(
      secret,
      headers({
        "webhook-id": "msg_test",
        "webhook-timestamp": "1712345678",
        "webhook-signature": `v1,${signature}`,
      }),
      body,
      1712345678 + 301,
    )
    expect(bad).toEqual({ ok: false, reason: "signature" })
    expect(stale).toEqual({ ok: false, reason: "timestamp" })
  })
})

describe("adres nagrania", () => {
  it("zostawia https na fathom.video i odrzuca inny host", () => {
    expect(fathomRecordingUrl("https://fathom.video/calls/1")).toBe("https://fathom.video/calls/1")
    expect(fathomRecordingUrl("https://zoom.us/j/1")).toBeNull()
    expect(fathomRecordingUrl("http://fathom.video/calls/1")).toBeNull()
  })
})

describe("normalizacja spotkania", () => {
  it("bierze identyfikator, mówcę i nie zapisuje obcego adresu", () => {
    const meeting = normalizeFathomMeeting({
      recording_id: 123,
      title: "Rozmowa",
      recording_start_time: "2026-10-02T08:00:00Z",
      recording_end_time: "2026-10-02T08:10:00Z",
      url: "https://zoom.us/j/1",
      share_url: "https://fathom.video/share/abc",
      recorded_by: { email: "anna@przyklad.test", name: "Anna" },
      calendar_invitees: [{ name: "Ewa", email: "ewa@przyklad.test" }],
      transcript: [
        {
          speaker: { display_name: "Ewa", matched_calendar_invitee_email: "ewa@przyklad.test" },
          text: "Dzień dobry",
          timestamp: "00:05:32",
        },
      ],
      default_summary: { markdown_formatted: "## Ustalenia" },
      action_items: [{ description: "Oddzwonić", assignee: { name: "Anna", email: "anna@przyklad.test" } }],
    })

    expect(meeting?.recordingId).toBe("123")
    expect(meeting?.recordingUrl).toBeNull()
    expect(meeting?.shareUrl).toBe("https://fathom.video/share/abc")
    expect(meeting?.transcript[0]?.offset_ms).toBe(332_000)
    expect(meeting?.durationSeconds).toBe(600)
    expect(meeting?.actionItems).toHaveLength(1)
  })
})

describe("lista spotkań Fathom", () => {
  it("schodzi po kilku stronach i filtruje własne nagrania", async () => {
    const calls: string[] = []
    const pages = [
      { items: [{ recording_id: 1, title: "A", created_at: "2026-10-01T00:00:00Z" }], next_cursor: "page-2" },
      { items: [{ recording_id: 2, title: "B", created_at: "2026-10-02T00:00:00Z" }], next_cursor: null },
    ]
    const transport: FathomTransport = {
      fetch: async (input) => {
        calls.push(String(input))
        return Response.json(pages.shift())
      },
      sleep: async () => undefined,
    }

    const listed = await listOwnMeetings(
      "key",
      { recordedBy: "anna@przyklad.test", createdAfter: "2026-10-01T00:00:00Z" },
      transport,
      10,
    )

    expect(listed.items).toHaveLength(2)
    expect(listed.nextCursor).toBeNull()
    expect(calls[0]).toContain("recorded_by%5B%5D=anna%40przyklad.test")
    expect(calls[0]).toContain("include_transcript=true")
    expect(calls[1]).toContain("cursor=page-2")
  })

  it("po 429 czeka Retry-After, a 401 zatrzymuje od razu", async () => {
    const waits: number[] = []
    let calls = 0
    const retrying: FathomTransport = {
      fetch: async () => {
        calls += 1
        if (calls === 1) {
          return new Response("{}", { status: 429, headers: { "retry-after": "2" } })
        }
        return Response.json({ items: [], next_cursor: null })
      },
      sleep: async (ms) => {
        waits.push(ms)
      },
    }
    await listOwnMeetings("key", { recordedBy: "anna@przyklad.test" }, retrying, 1)
    expect(waits).toEqual([2000])

    let unauthorizedCalls = 0
    const denied: FathomTransport = {
      fetch: async () => {
        unauthorizedCalls += 1
        return new Response("{}", { status: 401 })
      },
      sleep: async () => undefined,
    }
    await expect(
      listOwnMeetings("key", { recordedBy: "anna@przyklad.test" }, denied, 3),
    ).rejects.toBeInstanceOf(FathomRequestError)
    expect(unauthorizedCalls).toBe(1)
  })
})

describe("zakres dat", () => {
  it("liczy północ Europe/Warsaw", () => {
    expect(warsawMidnightIso("2026-10-02")).toBe("2026-10-01T22:00:00.000Z")
    expect(nextCalendarDay("2026-10-02")).toBe("2026-10-03")
  })
})
