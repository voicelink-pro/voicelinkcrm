"use server"

import { revalidatePath } from "next/cache"

import { getWorkspaceGate } from "@/lib/auth/access"
import { normalizeGoogleCalendarIcalUrl } from "@/lib/crm/calendar-ical"
import {
  syncCalendarSourceById,
  syncDueWorkspaceCalendars,
  type CalendarColor,
} from "@/lib/crm/calendar-sync"
import { createAdminClient } from "@/lib/supabase/admin"

export type CalendarActionState = {
  error?: string
  notice?: string
  savedAt?: number
}

const allowedColors = new Set<CalendarColor>(["blue", "emerald", "amber", "violet", "rose"])

function refreshCalendar() {
  revalidatePath("/calendar")
  revalidatePath("/")
}

export async function addGoogleCalendarSourceAction(
  _state: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do tego obszaru roboczego." }
  }

  const label = String(formData.get("label") ?? "").trim() || "Kalendarz Google"
  const rawUrl = String(formData.get("icalUrl") ?? "").trim()
  const rawUser = String(formData.get("userId") ?? "").trim() || gate.userId
  const rawColor = String(formData.get("color") ?? "blue").trim() as CalendarColor
  const color: CalendarColor = allowedColors.has(rawColor) ? rawColor : "blue"

  const icalUrl = normalizeGoogleCalendarIcalUrl(rawUrl)
  if (!icalUrl) {
    return {
      error:
        "Podaj prawidłowy adres iCal (.ics) z ustawień Google Calendar lub adres e-mail publicznego kalendarza Google.",
    }
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from("calendar_sources")
    .insert({
      workspace_id: gate.workspaceId,
      user_id: rawUser,
      label: label.slice(0, 120),
      ical_url: icalUrl,
      color,
      enabled: true,
      sync_interval_minutes: 10,
    })
    .select("id")
    .single()

  if (error || !created) {
    return { error: "Nie udało się zapisać połączenia z kalendarzem Google." }
  }

  const synced = await syncCalendarSourceById(created.id)
  refreshCalendar()

  if (!synced.ok) {
    return {
      savedAt: Date.now(),
      notice: `Dodano kalendarz, ale pierwsza synchronizacja wymaga uwagi: ${synced.message}`,
    }
  }

  return {
    savedAt: Date.now(),
    notice: `${synced.message} Automatyczna synchronizacja co 10 minut została włączona.`,
  }
}

export async function syncCalendarNowAction(sourceId?: string): Promise<{
  ok: boolean
  message: string
}> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, message: "Brak dostępu." }
  }

  if (sourceId) {
    const res = await syncCalendarSourceById(sourceId)
    refreshCalendar()
    return { ok: res.ok, message: res.message }
  }

  const admin = createAdminClient()
  const { data: sources } = await admin
    .from("calendar_sources")
    .select("id")
    .eq("workspace_id", gate.workspaceId)
    .eq("enabled", true)

  if (!sources?.length) {
    return { ok: false, message: "Brak podłączonych kalendarzy Google do synchronizacji." }
  }

  let totalImported = 0
  for (const src of sources) {
    const res = await syncCalendarSourceById(src.id)
    if (res.ok) totalImported += res.imported
  }

  refreshCalendar()
  return {
    ok: true,
    message: `Zsynchronizowano kalendarze (${sources.length}) · pobrano ${totalImported} wydarzeń.`,
  }
}

export async function triggerAutoSyncAction(): Promise<{ syncedAt: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind === "member") {
    await syncDueWorkspaceCalendars(gate.workspaceId).catch(() => undefined)
    revalidatePath("/calendar")
  }
  return { syncedAt: new Date().toISOString() }
}

export async function removeCalendarSourceAction(sourceId: string): Promise<{ ok: boolean }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") return { ok: false }

  const admin = createAdminClient()
  await admin
    .from("calendar_sources")
    .delete()
    .eq("id", sourceId)
    .eq("workspace_id", gate.workspaceId)

  refreshCalendar()
  return { ok: true }
}

export async function createCalendarEventAction(
  _state: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do tego obszaru roboczego." }
  }

  const title = String(formData.get("title") ?? "").trim()
  const date = String(formData.get("date") ?? "").trim()
  const startTime = String(formData.get("startTime") ?? "10:00").trim()
  const endTime = String(formData.get("endTime") ?? "11:00").trim()
  const userId = String(formData.get("userId") ?? "").trim() || gate.userId
  const accountId = String(formData.get("accountId") ?? "").trim() || null
  const location = String(formData.get("location") ?? "").trim() || null
  const meetingUrl = String(formData.get("meetingUrl") ?? "").trim() || null
  const description = String(formData.get("description") ?? "").trim() || null

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Podaj tytuł oraz datę wydarzenia." }
  }

  const startsAt = new Date(`${date}T${startTime || "10:00"}:00`)
  const endsAt = new Date(`${date}T${endTime || "11:00"}:00`)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Nieprawidłowa data lub godzina." }
  }

  const finalEnd =
    endsAt.getTime() > startsAt.getTime()
      ? endsAt
      : new Date(startsAt.getTime() + 3600_000)

  const admin = createAdminClient()
  const { error } = await admin.from("calendar_events").insert({
    workspace_id: gate.workspaceId,
    user_id: userId,
    title: title.slice(0, 300),
    description,
    location,
    meeting_url: meetingUrl,
    starts_at: startsAt.toISOString(),
    ends_at: finalEnd.toISOString(),
    all_day: false,
    account_id: accountId,
  })

  if (error) {
    return { error: "Nie udało się utworzyć wydarzenia." }
  }

  refreshCalendar()
  return { savedAt: Date.now(), notice: "Dodano wydarzenie do kalendarza." }
}

export async function deleteCalendarEventAction(eventId: string): Promise<{ ok: boolean }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") return { ok: false }

  const rawId = eventId.replace(/^cal-/, "")
  const admin = createAdminClient()
  await admin
    .from("calendar_events")
    .delete()
    .eq("id", rawId)
    .eq("workspace_id", gate.workspaceId)

  refreshCalendar()
  return { ok: true }
}
