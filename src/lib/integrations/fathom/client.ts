import {
  fathomMeetingListSchema,
  fathomSummarySchema,
  fathomTranscriptSchema,
  type FathomMeeting,
} from "@/lib/integrations/fathom/contract"

const apiBase = "https://api.fathom.ai/external/v1"
const maxTries = 3
const maxWaitMs = 120_000

export type FathomTransport = {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
}

export class FathomRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: number | null,
  ) {
    super(status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "unavailable")
  }
}

function retryAfterSeconds(header: string | null) {
  const value = Number(header)
  if (!Number.isFinite(value) || value < 0) {
    return 1
  }

  return value
}

export async function fathomRequest(
  apiKey: string,
  path: string,
  transport: FathomTransport,
) {
  let attempt = 0

  while (attempt < maxTries) {
    attempt += 1
    const response = await transport.fetch(`${apiBase}${path}`, {
      headers: {
        accept: "application/json",
        "X-Api-Key": apiKey,
      },
    })

    if (response.status === 401) {
      throw new FathomRequestError(401, null)
    }

    if (response.status === 429) {
      const retryAfter = retryAfterSeconds(response.headers.get("retry-after"))
      if (attempt >= maxTries) {
        throw new FathomRequestError(429, retryAfter)
      }
      await transport.sleep(Math.min(retryAfter * 1000, maxWaitMs))
      continue
    }

    if (response.status >= 500) {
      if (attempt >= maxTries) {
        throw new FathomRequestError(response.status, null)
      }
      await transport.sleep(Math.min(500 * 2 ** (attempt - 1), maxWaitMs))
      continue
    }

    return response
  }

  throw new FathomRequestError(503, null)
}

export type MeetingQuery = {
  recordedBy?: string | null
  createdAfter?: string | null
  createdBefore?: string | null
  cursor?: string | null
}

export async function listOwnMeetingPage(
  apiKey: string,
  query: MeetingQuery,
  transport: FathomTransport,
) {
  const params = new URLSearchParams()
  if (query.recordedBy) params.append("recorded_by[]", query.recordedBy)
  params.set("include_summary", "true")
  params.set("include_transcript", "true")
  params.set("include_action_items", "true")
  if (query.createdAfter) params.set("created_after", query.createdAfter)
  if (query.createdBefore) params.set("created_before", query.createdBefore)
  if (query.cursor) params.set("cursor", query.cursor)

  const response = await fathomRequest(apiKey, `/meetings?${params.toString()}`, transport)
  if (!response.ok) {
    throw new FathomRequestError(response.status, null)
  }

  const parsed = fathomMeetingListSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new FathomRequestError(422, null)
  }

  return {
    items: parsed.data.items,
    nextCursor: parsed.data.next_cursor ?? null,
  }
}

export async function listOwnMeetings(
  apiKey: string,
  query: MeetingQuery,
  transport: FathomTransport,
  maxPages: number,
) {
  const items: FathomMeeting[] = []
  let cursor = query.cursor ?? null
  let pages = 0

  while (pages < maxPages) {
    const page = await listOwnMeetingPage(apiKey, { ...query, cursor }, transport)
    items.push(...page.items)
    pages += 1
    cursor = page.nextCursor
    if (!cursor) {
      break
    }
  }

  return { items, nextCursor: cursor, pages }
}

export async function fetchRecordingSummary(
  apiKey: string,
  recordingId: string,
  transport: FathomTransport,
) {
  const response = await fathomRequest(
    apiKey,
    `/recordings/${encodeURIComponent(recordingId)}/summary`,
    transport,
  )
  if (!response.ok) {
    throw new FathomRequestError(response.status, null)
  }

  const parsed = fathomSummarySchema.safeParse(await response.json())
  if (!parsed.success) {
    return null
  }

  return parsed.data.summary?.markdown_formatted ?? null
}

export async function fetchRecordingTranscript(
  apiKey: string,
  recordingId: string,
  transport: FathomTransport,
) {
  const response = await fathomRequest(
    apiKey,
    `/recordings/${encodeURIComponent(recordingId)}/transcript`,
    transport,
  )
  if (!response.ok) {
    throw new FathomRequestError(response.status, null)
  }

  const parsed = fathomTranscriptSchema.safeParse(await response.json())
  return parsed.success ? parsed.data.transcript ?? [] : []
}
