import "server-only"

import { meetingPageSize } from "@/lib/crm/meeting-query"
import { createClient } from "@/lib/supabase/server"

export type MeetingLinkView = {
  id: string
  accountId: string
  accountName: string
  dealId: string | null
  dealTitle: string | null
  origin: string
}

export type MeetingListItem = {
  id: string
  title: string
  startedAt: string
  durationSeconds: number | null
  recordedByEmail: string | null
  syncStatus: string
  matchingState: string
  links: MeetingLinkView[]
}

const readError = "Nie udało się wczytać spotkań."

export async function listMeetings(query: { q: string; page: number }) {
  const supabase = await createClient()
  const from = (query.page - 1) * meetingPageSize
  const to = from + meetingPageSize - 1
  let request = supabase
    .from("meeting_records")
    .select(
      "id, title, started_at, duration_seconds, recorded_by_email, sync_status, matching_state",
      { count: "exact" },
    )
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  const needle = query.q.replace(/[%_\\]/g, "")
  if (needle) {
    request = request.ilike("title", `%${needle}%`)
  }

  const listed = await request
  if (listed.error) {
    return { items: [] as MeetingListItem[], count: 0, message: readError }
  }

  const ids = (listed.data ?? []).map((row) => row.id)
  const links = await linksFor(ids)
  return {
    items: (listed.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      startedAt: row.started_at,
      durationSeconds: row.duration_seconds,
      recordedByEmail: row.recorded_by_email,
      syncStatus: row.sync_status,
      matchingState: row.matching_state,
      links: links.filter((link) => link.meetingId === row.id),
    })),
    count: listed.count ?? 0,
    message: null,
  }
}

export async function getMeeting(meetingId: string) {
  const supabase = await createClient()
  const meeting = await supabase
    .from("meeting_records")
    .select(
      "id, title, started_at, ended_at, duration_seconds, recorded_by_email, recording_url, share_url, summary_markdown, sync_status, matching_state, provider_action_items, content_attempts, content_error, content_updated_at, last_synced_at",
    )
    .eq("id", meetingId)
    .maybeSingle()

  if (meeting.error) {
    return { meeting: null, message: readError }
  }
  if (!meeting.data) {
    return { meeting: null, message: null }
  }

  const [segments, participants, links, notes] = await Promise.all([
    supabase
      .from("meeting_transcript_segments")
      .select("id, ordinal, speaker_name, speaker_email, offset_ms, segment_text")
      .eq("meeting_record_id", meetingId)
      .order("ordinal"),
    supabase
      .from("meeting_participants")
      .select("id, display_name, email, contact_id")
      .eq("meeting_record_id", meetingId)
      .order("created_at"),
    linksFor([meetingId]),
    supabase
      .from("notes")
      .select("id, body, created_at, created_by")
      .eq("meeting_record_id", meetingId)
      .order("created_at"),
  ])

  if (segments.error || participants.error || notes.error) {
    return { meeting: null, message: readError }
  }

  return {
    meeting: {
      ...meeting.data,
      segments: segments.data ?? [],
      participants: participants.data ?? [],
      links: links.filter((link) => link.meetingId === meetingId),
      notes: notes.data ?? [],
    },
    message: null,
  }
}

async function linksFor(meetingIds: string[]) {
  if (meetingIds.length === 0) {
    return [] as Array<MeetingLinkView & { meetingId: string }>
  }

  const supabase = await createClient()
  const listed = await supabase
    .from("meeting_links")
    .select("id, meeting_record_id, account_id, deal_id, origin")
    .in("meeting_record_id", meetingIds)

  const rows = listed.data ?? []
  const accountIds = [...new Set(rows.map((row) => row.account_id))]
  const dealIds = [...new Set(rows.flatMap((row) => (row.deal_id ? [row.deal_id] : [])))]
  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id, display_name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? supabase.from("deals").select("id, title").in("id", dealIds)
      : Promise.resolve({ data: [] }),
  ])
  const accountNames = new Map((accounts.data ?? []).map((row) => [row.id, row.display_name]))
  const dealTitles = new Map((deals.data ?? []).map((row) => [row.id, row.title]))

  return rows.map((row) => ({
    meetingId: row.meeting_record_id,
    id: row.id,
    accountId: row.account_id,
    accountName: accountNames.get(row.account_id) ?? "Firma",
    dealId: row.deal_id,
    dealTitle: row.deal_id ? dealTitles.get(row.deal_id) ?? null : null,
    origin: row.origin,
  }))
}

export async function meetingDirectories() {
  const supabase = await createClient()
  const [accounts, deals, members, settings] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, display_name")
      .is("archived_at", null)
      .order("display_name")
      .limit(200),
    supabase
      .from("deals")
      .select("id, account_id, title, stage")
      .is("archived_at", null)
      .order("title")
      .limit(400),
    supabase.from("profiles").select("user_id, full_name").order("full_name"),
    supabase.from("automation_settings").select("fathom_poll_interval_minutes").limit(1).maybeSingle(),
  ])

  return {
    accounts: (accounts.data ?? []).map((row) => ({ id: row.id, label: row.display_name })),
    deals: (deals.data ?? []).map((row) => ({
      id: row.id,
      accountId: row.account_id,
      title: row.title,
      open: row.stage !== "won" && row.stage !== "lost",
    })),
    members: (members.data ?? []).map((row) => ({ id: row.user_id, label: row.full_name })),
    pollMinutes: settings.data?.fathom_poll_interval_minutes ?? 15,
  }
}
