import "server-only"

import { parseIcalFeed } from "@/lib/crm/calendar-ical"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type CalendarColor = "blue" | "emerald" | "amber" | "violet" | "rose"

export type CalendarSourceView = {
  id: string
  userId: string
  userName: string
  label: string
  icalUrl: string
  color: CalendarColor
  enabled: boolean
  syncIntervalMinutes: number
  lastSyncedAt: string | null
  lastError: string | null
}

export type UnifiedCalendarItem = {
  id: string
  kind: "google" | "local" | "task" | "meeting"
  userId: string
  userName: string
  userAvatarUrl: string | null
  title: string
  description: string | null
  location: string | null
  meetingUrl: string | null
  startsAt: string
  endsAt: string
  dayKey: string
  allDay: boolean
  color: CalendarColor
  sourceLabel: string
  href: string | null
  accountName: string | null
}

function toWarsawDayKey(isoString: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString))
}

const memberPalette: CalendarColor[] = ["blue", "emerald", "violet", "amber", "rose"]

function colorForUser(userId: string, orderedUserIds: string[]): CalendarColor {
  const index = orderedUserIds.indexOf(userId)
  if (index < 0) return "blue"
  return memberPalette[index % memberPalette.length] ?? "blue"
}

export async function syncCalendarSourceById(sourceId: string): Promise<{
  ok: boolean
  imported: number
  message: string
}> {
  const admin = createAdminClient()
  const { data: source, error } = await admin
    .from("calendar_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle()

  if (error || !source) {
    return { ok: false, imported: 0, message: "Nie znaleziono źródła kalendarza." }
  }

  try {
    const response = await fetch(source.ical_url, {
      headers: {
        Accept: "text/calendar, text/plain, */*",
        "User-Agent": "VoiceLink-CRM-Calendar-Sync/1.0",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const errText = `HTTP ${response.status}`
      await admin
        .from("calendar_sources")
        .update({ last_error: errText, updated_at: new Date().toISOString() })
        .eq("id", source.id)
      return {
        ok: false,
        imported: 0,
        message: `Google Calendar zwrócił błąd (${errText}). Sprawdź, czy link iCal jest publiczny lub prywatny adres ICAL jest poprawny.`,
      }
    }

    const rawText = await response.text()
    if (!rawText.includes("BEGIN:VCALENDAR")) {
      await admin
        .from("calendar_sources")
        .update({
          last_error: "invalid_ical_format",
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id)
      return {
        ok: false,
        imported: 0,
        message: "Podany adres nie zwraca formatu iCal (.ics). Wklej adres URL w formacie iCal z ustawień Google Calendar.",
      }
    }

    const parsedEvents = parseIcalFeed(rawText)

    // Ograniczamy do wydarzeń z ostatnich 90 dni i przyszłych 365 dni
    const minTime = Date.now() - 90 * 86400_000
    const maxTime = Date.now() + 365 * 86400_000
    const relevant = parsedEvents
      .filter((ev) => {
        const ts = new Date(ev.startsAt).getTime()
        return ts >= minTime && ts <= maxTime
      })
      .slice(0, 500)

    if (relevant.length > 0) {
      const rows = relevant.map((ev) => ({
        workspace_id: source.workspace_id,
        user_id: source.user_id,
        source_id: source.id,
        external_uid: ev.uid.slice(0, 240),
        title: ev.title.slice(0, 300),
        description: ev.description ? ev.description.slice(0, 10000) : null,
        location: ev.location ? ev.location.slice(0, 500) : null,
        meeting_url: ev.meetingUrl ? ev.meetingUrl.slice(0, 500) : null,
        starts_at: ev.startsAt,
        ends_at: ev.endsAt,
        all_day: ev.allDay,
        updated_at: new Date().toISOString(),
      }))

      const { error: upsertErr } = await admin
        .from("calendar_events")
        .upsert(rows, { onConflict: "source_id,external_uid" })

      if (upsertErr) {
        await admin
          .from("calendar_sources")
          .update({
            last_error: upsertErr.message.slice(0, 200),
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id)
        return {
          ok: false,
          imported: 0,
          message: "Nie udało się zapisać wydarzeń w bazie.",
        }
      }
    }

    await admin
      .from("calendar_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)

    return {
      ok: true,
      imported: relevant.length,
      message: `Zsynchronizowano ${relevant.length} wydarzeń z kalendarza Google.`,
    }
  } catch {
    await admin
      .from("calendar_sources")
      .update({
        last_error: "network_error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)
    return {
      ok: false,
      imported: 0,
      message: "Nie udało się połączyć z adresem kalendarza Google.",
    }
  }
}

export async function syncDueWorkspaceCalendars(workspaceId: string) {
  const admin = createAdminClient()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()

  const { data: sources } = await admin
    .from("calendar_sources")
    .select("id, last_synced_at")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true)

  const dueSources = (sources ?? []).filter(
    (s) => !s.last_synced_at || s.last_synced_at < tenMinutesAgo,
  )

  for (const src of dueSources) {
    await syncCalendarSourceById(src.id)
  }
}

export async function loadCalendarView(input: {
  workspaceId: string
  viewerId: string
  fromIso: string
  toIso: string
  fromDay: string
  toDay: string
}) {
  // Automatyczne dociągnięcie źródeł Google starszych niż 10 minut
  await syncDueWorkspaceCalendars(input.workspaceId).catch(() => undefined)

  const supabase = await createClient()
  const [membersRes, sourcesRes, eventsRes, tasksRes, meetingsRes, accountsRes] =
    await Promise.all([
      supabase.from("profiles").select("user_id, full_name, avatar_url").order("full_name"),
      supabase
        .from("calendar_sources")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("calendar_events")
        .select("*")
        .gte("ends_at", input.fromIso)
        .lte("starts_at", input.toIso)
        .order("starts_at", { ascending: true }),
      supabase
        .from("tasks")
        .select("id, title, description, due_on, due_at, status, priority, account_id, created_by")
        .is("archived_at", null)
        .gte("due_on", input.fromDay)
        .lte("due_on", input.toDay),
      supabase
        .from("meeting_records")
        .select("id, title, started_at, ended_at, duration_seconds, recorded_by_email, share_url")
        .gte("started_at", input.fromIso)
        .lte("started_at", input.toIso)
        .order("started_at", { ascending: true }),
      supabase
        .from("accounts")
        .select("id, display_name")
        .is("archived_at", null)
        .order("display_name")
        .limit(200),
    ])

  const members = (membersRes.data ?? []).map((m) => ({
    userId: m.user_id,
    fullName: m.full_name,
    avatarUrl: m.avatar_url ?? null,
  }))
  const memberNames = new Map(members.map((m) => [m.userId, m.fullName]))
  const memberAvatars = new Map(members.map((m) => [m.userId, m.avatarUrl]))
  const orderedUserIds = members.map((m) => m.userId)
  const accountNames = new Map((accountsRes.data ?? []).map((a) => [a.id, a.display_name]))

  const sources: CalendarSourceView[] = (sourcesRes.data ?? []).map((s) => ({
    id: s.id,
    userId: s.user_id,
    userName: memberNames.get(s.user_id) ?? "Użytkownik",
    label: s.label,
    icalUrl: s.ical_url,
    color: (s.color as CalendarColor) || colorForUser(s.user_id, orderedUserIds),
    enabled: s.enabled,
    syncIntervalMinutes: s.sync_interval_minutes,
    lastSyncedAt: s.last_synced_at,
    lastError: s.last_error,
  }))
  const sourceMap = new Map(sources.map((s) => [s.id, s]))

  const taskIds = (tasksRes.data ?? []).map((t) => t.id)
  const taskAssigneesRes = taskIds.length
    ? await supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
    : { data: [] }

  const assigneesByTask = new Map<string, string[]>()
  for (const row of taskAssigneesRes.data ?? []) {
    const list = assigneesByTask.get(row.task_id) ?? []
    list.push(row.user_id)
    assigneesByTask.set(row.task_id, list)
  }

  const items: UnifiedCalendarItem[] = []

  // 1. Wydarzenia z Google Calendar oraz ręczne wydarzenia kalendarzowe
  for (const ev of eventsRes.data ?? []) {
    const src = ev.source_id ? sourceMap.get(ev.source_id) : null
    if (ev.source_id && src && !src.enabled) continue

    const color = src?.color ?? colorForUser(ev.user_id, orderedUserIds)
    items.push({
      id: `cal-${ev.id}`,
      kind: ev.source_id ? "google" : "local",
      userId: ev.user_id,
      userName: memberNames.get(ev.user_id) ?? "Członek zespołu",
      userAvatarUrl: memberAvatars.get(ev.user_id) ?? null,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      meetingUrl: ev.meeting_url,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
      dayKey: toWarsawDayKey(ev.starts_at),
      allDay: ev.all_day,
      color,
      sourceLabel: src ? src.label : "Kalendarz CRM",
      href: ev.account_id ? `/accounts/${ev.account_id}` : null,
      accountName: ev.account_id ? (accountNames.get(ev.account_id) ?? null) : null,
    })
  }

  // 2. Zadania CRM z terminem wykonania
  for (const task of tasksRes.data ?? []) {
    if (!task.due_on) continue
    const assignees = assigneesByTask.get(task.id) ?? (task.created_by ? [task.created_by] : [])
    const primaryUser = assignees[0] ?? input.viewerId
    const startsAt = task.due_at ?? `${task.due_on}T09:00:00.000Z`
    const endsAt = task.due_at
      ? new Date(new Date(task.due_at).getTime() + 30 * 60_000).toISOString()
      : `${task.due_on}T10:00:00.000Z`

    items.push({
      id: `task-${task.id}`,
      kind: "task",
      userId: primaryUser,
      userName: assignees.map((id) => memberNames.get(id) ?? "Zespół").join(", "),
      userAvatarUrl: memberAvatars.get(primaryUser) ?? null,
      title: task.title,
      description: task.description,
      location: null,
      meetingUrl: null,
      startsAt,
      endsAt,
      dayKey: task.due_on,
      allDay: !task.due_at,
      color: "amber",
      sourceLabel: task.status === "done" ? "Zadanie (ukończone)" : "Zadanie CRM",
      href: `/tasks/${task.id}`,
      accountName: task.account_id ? (accountNames.get(task.account_id) ?? null) : null,
    })
  }

  // 3. Spotkania Fathom
  for (const meeting of meetingsRes.data ?? []) {
    const endIso =
      meeting.ended_at ??
      new Date(
        new Date(meeting.started_at).getTime() + (meeting.duration_seconds ?? 1800) * 1000,
      ).toISOString()

    items.push({
      id: `mtg-${meeting.id}`,
      kind: "meeting",
      userId: input.viewerId,
      userName: meeting.recorded_by_email ?? "Fathom",
      userAvatarUrl: memberAvatars.get(input.viewerId) ?? null,
      title: meeting.title,
      description: "Nagranie i podsumowanie spotkania Fathom",
      location: "Spotkanie online",
      meetingUrl: meeting.share_url,
      startsAt: meeting.started_at,
      endsAt: endIso,
      dayKey: toWarsawDayKey(meeting.started_at),
      allDay: false,
      color: "emerald",
      sourceLabel: "Spotkanie Fathom",
      href: `/meetings/${meeting.id}`,
      accountName: null,
    })
  }

  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  return {
    members,
    sources,
    items,
    accounts: (accountsRes.data ?? []).map((a) => ({
      id: a.id,
      displayName: a.display_name,
    })),
  }
}
