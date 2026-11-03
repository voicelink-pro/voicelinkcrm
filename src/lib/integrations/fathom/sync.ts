import "server-only"

import {
  FathomRequestError,
  fetchRecordingSummary,
  fetchRecordingTranscript,
  listOwnMeetings,
  type FathomTransport,
} from "@/lib/integrations/fathom/client"
import { normalizeFathomMeeting, type NormalizedMeeting } from "@/lib/integrations/fathom/normalize"
import { fathomApiKey } from "@/lib/integrations/fathom/secrets"
import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"
import { saveFathomCursor, upsertFathomMeeting, type FathomConnection } from "@/lib/integrations/fathom/store"

export const fathomPageStep = 10
export const fathomContentAttemptCap = 5

const transport: FathomTransport = {
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export async function syncFathomConnection(input: {
  actorId: string
  connection: FathomConnection
  pollMinutes: number
  createdAfter?: string | null
  createdBefore?: string | null
  freshRange?: boolean
}) {
  if (!previewSideEffectsAllowed()) {
    return {
      message:
        "Preview nie wywołuje Fathoma. Włączenie wymaga ENABLE_PREVIEW_SIDE_EFFECTS=true na danych nieprodukcyjnych.",
    }
  }

  const apiKey = fathomApiKey(input.connection.secretRef)
  if (!apiKey) {
    return {
      message:
        "Klucz API tego konta nie jest ustawiony na serwerze. Weryfikacja na żywym Fathomie jest niewykonana.",
    }
  }

  const cursor = input.freshRange ? {} : input.connection.cursor
  const createdAfter =
    input.createdAfter ?? cursor.created_after ?? cursor.watermark ?? null
  const createdBefore = input.createdBefore ?? cursor.created_before ?? null

  try {
    const page = await listOwnMeetings(
      apiKey,
      {
        recordedBy: input.connection.externalAccountEmail ?? null,
        createdAfter,
        createdBefore,
        cursor: input.freshRange ? null : cursor.next_cursor,
      },
      transport,
      fathomPageStep,
    )

    let saved = 0
    for (const item of page.items) {
      const meeting = normalizeFathomMeeting(item)
      if (!meeting) {
        continue
      }
      const applied = await upsertFathomMeeting(input.connection.id, meeting, null)
      if (applied.message || !applied.data) {
        return { message: applied.message ?? "Nie udało się zapisać spotkania." }
      }
      saved += 1
      if (
        applied.data.sync_status !== "synced" &&
        applied.data.content_attempts < fathomContentAttemptCap &&
        /^\d+$/.test(meeting.recordingId)
      ) {
        await fillMissingContent(input.connection.id, apiKey, meeting)
      }
    }

    const nextCursor = page.nextCursor
    await saveFathomCursor(
      input.actorId,
      input.connection.id,
      {
        watermark: nextCursor ? cursor.watermark ?? createdAfter : watermark(input.pollMinutes),
        next_cursor: nextCursor,
        created_after: createdAfter,
        created_before: createdBefore,
      },
      true,
      null,
    )

    const range = createdAfter
      ? `od ${createdAfter}${createdBefore ? ` do ${createdBefore}` : ""}`
      : "z konta Fathom"
    if (nextCursor) {
      return {
        message: `Zapisano ${saved} spotkań (${range}). Zostały kolejne strony — kliknij Pobierz ponownie.`,
      }
    }

    return { message: `Zapisano ${saved} spotkań (${range}).` }
  } catch (error) {
    if (error instanceof FathomRequestError && error.status === 401) {
      await saveFathomCursor(input.actorId, input.connection.id, input.connection.cursor, false, "unauthorized")
      return { message: "Fathom odrzucił klucz. Dalsze próby tego przebiegu zostały wstrzymane." }
    }
    if (error instanceof FathomRequestError && error.status === 429) {
      const wait = error.retryAfter ?? 60
      await saveFathomCursor(input.actorId, input.connection.id, input.connection.cursor, false, "rate_limited")
      return { message: `Fathom ograniczył liczbę żądań. Spróbuj ponownie za ${wait} s.` }
    }
    return { message: "Synchronizacja nie doszła do końca. Można ją wznowić." }
  }
}

async function fillMissingContent(connectionId: string, apiKey: string, meeting: NormalizedMeeting) {
  try {
    const summary = meeting.summaryMarkdown ?? (await fetchRecordingSummary(apiKey, meeting.recordingId, transport))
    const transcript = meeting.transcript.length
      ? meeting.transcript
      : await fetchRecordingTranscript(apiKey, meeting.recordingId, transport)
    const normalized = normalizeTranscript(transcript)
    if (!summary && normalized.length === 0) {
      return
    }
    await upsertFathomMeeting(
      connectionId,
      {
        ...meeting,
        summaryMarkdown: summary,
        hasSummary: Boolean(summary),
        transcript: normalized,
        hasTranscript: normalized.length > 0,
        hasParticipants: false,
        hasActionItems: false,
      },
      null,
    )
  } catch (error) {
    if (error instanceof FathomRequestError && (error.status === 401 || error.status === 429)) {
      throw error
    }
    if (error instanceof FathomRequestError && error.status === 404) {
      return
    }
    await upsertFathomMeeting(
      connectionId,
      {
        ...meeting,
        hasSummary: false,
        hasTranscript: false,
        hasParticipants: false,
        hasActionItems: false,
      },
      "content_unavailable",
    )
  }
}

function normalizeTranscript(
  transcript: Awaited<ReturnType<typeof fetchRecordingTranscript>>,
): NormalizedMeeting["transcript"] {
  return transcript
    .filter((item) => item.text?.trim())
    .map((item) => ({
      speaker_name: item.speaker?.display_name ?? null,
      speaker_email: item.speaker?.matched_calendar_invitee_email ?? null,
      offset_ms: null,
      text: item.text?.trim() ?? "",
    }))
}

export async function retryFathomContent(
  connectionId: string,
  secretRef: string,
  meeting: { recordingId: string; title: string; startedAt: string },
) {
  if (!previewSideEffectsAllowed()) {
    return {
      message:
        "Preview nie wywołuje Fathoma. Włączenie wymaga ENABLE_PREVIEW_SIDE_EFFECTS=true na danych nieprodukcyjnych.",
    }
  }

  const apiKey = fathomApiKey(secretRef)
  if (!apiKey) {
    return { message: "Klucz API nie jest ustawiony na serwerze. Weryfikacja live jest niewykonana." }
  }
  if (!/^\d+$/.test(meeting.recordingId)) {
    return { message: "To nagranie nie ma liczbowego identyfikatora Fathoma. Treść nie została pobrana." }
  }

  try {
    await fillMissingContent(connectionId, apiKey, {
      recordingId: meeting.recordingId,
      title: meeting.title,
      startedAt: meeting.startedAt,
      endedAt: null,
      durationSeconds: null,
      recordedByEmail: null,
      recordingUrl: null,
      shareUrl: null,
      summaryMarkdown: null,
      hasSummary: false,
      transcript: [],
      hasTranscript: false,
      participants: [],
      hasParticipants: false,
      actionItems: [],
      hasActionItems: false,
    })
    return { message: "Ponowiono pobranie treści. Notatki i ręczne powiązania zostają." }
  } catch (error) {
    if (error instanceof FathomRequestError && error.status === 401) {
      return { message: "Fathom odrzucił klucz. Dalsze próby tego przebiegu zostały wstrzymane." }
    }
    if (error instanceof FathomRequestError && error.status === 429) {
      return { message: `Fathom ograniczył liczbę żądań. Spróbuj ponownie za ${error.retryAfter ?? 60} s.` }
    }
    return { message: "Pobranie treści nie doszło do końca." }
  }
}

function watermark(pollMinutes: number) {
  return new Date(Date.now() - pollMinutes * 60_000).toISOString()
}
