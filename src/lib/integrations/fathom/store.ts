import "server-only"

import { polishDatabaseError } from "@/lib/database/errors"
import type { NormalizedMeeting } from "@/lib/integrations/fathom/normalize"
import { createAdminClient } from "@/lib/supabase/admin"

export type FathomConnection = {
  id: string
  workspaceId: string
  label: string
  status: string
  enabled: boolean
  externalAccountEmail: string | null
  secretRef: string
  lastSuccessAt: string | null
  lastError: string | null
  cursor: FathomCursor
  ownerUserId: string | null
}

export type FathomCursor = {
  watermark?: string | null
  next_cursor?: string | null
  created_after?: string | null
  created_before?: string | null
}

export type UpsertResult = {
  meeting_id: string
  sync_status: string
  matching_state: string
  link_count: number
  source_count: number
  note_count: number
  segment_count: number
  content_attempts: number
}

type ConnectionRecord = {
  id: string
  workspace_id: string
  label: string | null
  status: string
  enabled: boolean
  external_account_email: string | null
  secret_ref: string
  last_success_at: string | null
  last_error: string | null
  cursor: FathomCursor | null
  owner_user_id: string | null
}

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema("private").rpc(name as never, args as never)
  if (error) {
    return { data: null as T | null, message: polishDatabaseError(error) }
  }
  return { data: data as T, message: null }
}

function presentConnection(row: ConnectionRecord): FathomConnection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label || "Konto Fathom",
    status: row.status,
    enabled: row.enabled,
    externalAccountEmail: row.external_account_email,
    secretRef: row.secret_ref,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    cursor: row.cursor ?? {},
    ownerUserId: row.owner_user_id,
  }
}

export async function listFathomConnections(workspaceId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema("private")
    .from("integration_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", "fathom")
    .order("created_at", { ascending: true })

  if (error) {
    return { connections: [] as FathomConnection[], message: "Nie udało się wczytać połączeń Fathom." }
  }

  return {
    connections: ((data ?? []) as ConnectionRecord[]).map(presentConnection),
    message: null,
  }
}

export async function getFathomConnection(connectionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema("private")
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", "fathom")
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return presentConnection(data as ConnectionRecord)
}

export async function upsertFathomMeeting(
  connectionId: string,
  meeting: NormalizedMeeting,
  contentError: string | null,
) {
  return rpc<UpsertResult>("upsert_fathom_meeting", {
    p_connection_id: connectionId,
    p_recording_id: meeting.recordingId,
    p_title: meeting.title,
    p_started_at: meeting.startedAt,
    p_ended_at: meeting.endedAt,
    p_duration_seconds: meeting.durationSeconds,
    p_recorded_by_email: meeting.recordedByEmail,
    p_recording_url: meeting.recordingUrl,
    p_share_url: meeting.shareUrl,
    p_summary_markdown: meeting.summaryMarkdown,
    p_has_summary: meeting.hasSummary,
    p_transcript: meeting.transcript,
    p_has_transcript: meeting.hasTranscript,
    p_participants: meeting.participants,
    p_has_participants: meeting.hasParticipants,
    p_action_items: meeting.actionItems,
    p_has_action_items: meeting.hasActionItems,
    p_content_error: contentError,
  })
}

export async function acceptFathomDelivery(
  connectionId: string,
  eventId: string,
  payloadHash: string,
  recordingId: string,
  jobPayload: unknown,
) {
  return rpc<{ state: string; job_id?: string }>("accept_fathom_delivery", {
    p_connection_id: connectionId,
    p_event_id: eventId,
    p_payload_hash: payloadHash,
    p_recording_id: recordingId,
    p_job_payload: jobPayload,
  })
}

export async function finishFathomDelivery(
  eventId: string,
  jobId: string,
  ok: boolean,
  error: string | null,
) {
  return rpc<null>("finish_fathom_delivery", {
    p_event_id: eventId,
    p_job_id: jobId,
    p_ok: ok,
    p_error: error,
  })
}

export async function saveFathomCursor(
  actorId: string,
  connectionId: string,
  cursor: FathomCursor,
  ok: boolean,
  error: string | null,
) {
  return rpc<null>("save_fathom_cursor", {
    p_actor_user_id: actorId,
    p_connection_id: connectionId,
    p_cursor: cursor,
    p_ok: ok,
    p_error: error,
  })
}
