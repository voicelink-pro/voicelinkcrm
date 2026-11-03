import type { FathomMeeting } from "@/lib/integrations/fathom/contract"
import { fathomRecordingUrl } from "@/lib/integrations/fathom/urls"

export type NormalizedMeeting = {
  recordingId: string
  title: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  recordedByEmail: string | null
  recordingUrl: string | null
  shareUrl: string | null
  summaryMarkdown: string | null
  hasSummary: boolean
  transcript: Array<{
    speaker_name: string | null
    speaker_email: string | null
    offset_ms: number | null
    text: string
  }>
  hasTranscript: boolean
  participants: Array<{ name: string | null; email: string | null }>
  hasParticipants: boolean
  actionItems: Array<{
    description: string
    assignee_name: string | null
    assignee_email: string | null
    timestamp: string | null
  }>
  hasActionItems: boolean
}

function offsetMs(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value ?? "")
  if (!match) {
    return null
  }

  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
}

function durationSeconds(start: string | null, end: string | null) {
  if (!start || !end) {
    return null
  }

  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) {
    return null
  }

  return Math.round(ms / 1000)
}

export function normalizeFathomMeeting(meeting: FathomMeeting): NormalizedMeeting | null {
  const recordingId = String(meeting.recording_id).trim()
  const startedAt =
    meeting.recording_start_time ||
    meeting.scheduled_start_time ||
    meeting.created_at ||
    null

  if (!recordingId || !startedAt) {
    return null
  }

  const endedAt = meeting.recording_end_time || meeting.scheduled_end_time || null
  const invitees = meeting.calendar_invitees ?? []
  const transcript = meeting.transcript ?? null
  const summary = meeting.default_summary?.markdown_formatted ?? null
  const actionItems = meeting.action_items ?? null

  return {
    recordingId,
    title: meeting.title?.trim() || meeting.meeting_title?.trim() || "Spotkanie",
    startedAt,
    endedAt,
    durationSeconds: durationSeconds(
      meeting.recording_start_time ?? null,
      meeting.recording_end_time ?? null,
    ),
    recordedByEmail: meeting.recorded_by?.email ?? null,
    recordingUrl: fathomRecordingUrl(meeting.url),
    shareUrl: fathomRecordingUrl(meeting.share_url),
    summaryMarkdown: summary,
    hasSummary: meeting.default_summary !== undefined && meeting.default_summary !== null,
    transcript: (transcript ?? [])
      .filter((item) => item.text?.trim())
      .map((item) => ({
        speaker_name: item.speaker?.display_name ?? null,
        speaker_email: item.speaker?.matched_calendar_invitee_email ?? null,
        offset_ms: offsetMs(item.timestamp),
        text: item.text?.trim() ?? "",
      })),
    hasTranscript: transcript !== null,
    participants: [
      ...invitees.map((person) => ({
        name: person.name ?? null,
        email: person.email ?? null,
      })),
      ...(meeting.recorded_by?.email
        ? [{ name: meeting.recorded_by.name ?? null, email: meeting.recorded_by.email }]
        : []),
    ],
    hasParticipants: true,
    actionItems: (actionItems ?? [])
      .filter((item) => item.description?.trim())
      .map((item) => ({
        description: item.description?.trim() ?? "",
        assignee_name: item.assignee?.name ?? null,
        assignee_email: item.assignee?.email ?? null,
        timestamp: item.recording_timestamp ?? null,
      })),
    hasActionItems: actionItems !== null,
  }
}
