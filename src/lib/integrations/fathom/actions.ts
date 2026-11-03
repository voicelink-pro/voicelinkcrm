"use server"

import { revalidatePath } from "next/cache"

import { getWorkspaceGate } from "@/lib/auth/access"
import { polishDatabaseError } from "@/lib/database/errors"
import { nextCalendarDay, warsawMidnightIso } from "@/lib/integrations/fathom/range"
import { fathomApiKey } from "@/lib/integrations/fathom/secrets"
import { retryFathomContent, syncFathomConnection } from "@/lib/integrations/fathom/sync"
import { getFathomConnection, listFathomConnections } from "@/lib/integrations/fathom/store"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type FathomFormState = { message?: string }

const dayPattern = /^\d{4}-\d{2}-\d{2}$/

async function actor() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false as const, message: "Brak dostępu do tego obszaru roboczego." }
  }
  return { ok: true as const, id: gate.userId, workspaceId: gate.workspaceId }
}

async function rpc(name: string, args: Record<string, unknown>) {
  try {
    const admin = createAdminClient()
    const { error } = await admin.schema("private").rpc(name as never, args as never)
    return error ? polishDatabaseError(error) : null
  } catch {
    return "Nie udało się zapisać zmiany."
  }
}

function refresh() {
  revalidatePath("/settings")
  revalidatePath("/meetings")
}

export async function setFathomEmailAction(
  _state: FathomFormState,
  formData: FormData,
): Promise<FathomFormState> {
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const message = await rpc("set_fathom_account_email", {
    p_actor_user_id: member.id,
    p_connection_id: String(formData.get("connectionId") ?? ""),
    p_email: String(formData.get("email") ?? ""),
  })
  if (!message) refresh()
  return { message: message ?? "Zapisano e-mail konta Fathom." }
}

export async function setFathomPollAction(
  _state: FathomFormState,
  formData: FormData,
): Promise<FathomFormState> {
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const minutes = Number(formData.get("minutes"))
  const message = await rpc("set_fathom_poll_minutes", {
    p_actor_user_id: member.id,
    p_minutes: minutes,
  })
  if (!message) refresh()
  return { message: message ?? "Zapisano odstęp uzupełniania." }
}

export async function ensureFirstFathomAccountAction(
  _state: FathomFormState,
  _formData: FormData,
): Promise<FathomFormState> {
  void _state
  void _formData
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const existing = await listFathomConnections(member.workspaceId)
  if (existing.connections.some((connection) => connection.secretRef === "fathom/account-1")) {
    return { message: "Pierwsze konto jest już dodane." }
  }
  const message = await rpc("ensure_fathom_connection", {
    p_actor_user_id: member.id,
    p_secret_ref: "fathom/account-1",
    p_label: "Konto Fathom",
  })
  if (!message) refresh()
  return {
    message:
      message ??
      "Dodano połączenie. Klucz zostaje w FATHOM_ACCOUNT_1_API_KEY i nie jest pokazywany.",
  }
}

export async function ensureSecondFathomAccountAction(
  _state: FathomFormState,
  _formData: FormData,
): Promise<FathomFormState> {
  void _state
  void _formData
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const existing = await listFathomConnections(member.workspaceId)
  if (existing.connections.some((connection) => connection.secretRef === "fathom/account-2")) {
    return { message: "Drugie konto jest już dodane." }
  }
  const message = await rpc("ensure_fathom_connection", {
    p_actor_user_id: member.id,
    p_secret_ref: "fathom/account-2",
    p_label: "Drugie konto Fathom",
  })
  if (!message) refresh()
  return {
    message:
      message ??
      "Dodano drugie połączenie. Klucz zostaje w FATHOM_ACCOUNT_2_API_KEY i nie jest pokazywany.",
  }
}

export async function syncFathomAction(
  _state: FathomFormState,
  formData: FormData,
): Promise<FathomFormState> {
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const connection = await getFathomConnection(String(formData.get("connectionId") ?? ""))
  if (!connection || connection.workspaceId !== member.workspaceId) {
    return { message: "Nie znaleziono połączenia." }
  }

  const mode = String(formData.get("mode") ?? "incremental")
  const supabase = await createClient()
  const settings = await supabase
    .from("automation_settings")
    .select("fathom_poll_interval_minutes")
    .eq("workspace_id", member.workspaceId)
    .maybeSingle()
  const pollMinutes = settings.data?.fathom_poll_interval_minutes ?? 15

  if (mode === "backfill") {
    const from = String(formData.get("from") ?? "")
    const to = String(formData.get("to") ?? "")
    if (!dayPattern.test(from) || !dayPattern.test(to) || from > to) {
      return { message: "Podaj początek i koniec zakresu. Cała historia nie jest pobierana sama." }
    }
    const result = await syncFathomConnection({
      actorId: member.id,
      connection,
      pollMinutes,
      createdAfter: warsawMidnightIso(from),
      createdBefore: warsawMidnightIso(nextCalendarDay(to)),
      freshRange: true,
    })
    refresh()
    return result
  }

  const result = await syncFathomConnection({
    actorId: member.id,
    connection,
    pollMinutes,
  })
  refresh()
  return result
}

export async function syncPrimaryFathomAction(
  _state: FathomFormState,
  formData: FormData,
): Promise<FathomFormState> {
  void _state
  const member = await actor()
  if (!member.ok) return { message: member.message }

  let listed = await listFathomConnections(member.workspaceId)
  if (!listed.connections.length) {
    const ensured = await rpc("ensure_fathom_connection", {
      p_actor_user_id: member.id,
      p_secret_ref: "fathom/account-1",
      p_label: "Konto Fathom",
    })
    if (ensured) return { message: ensured }
    listed = await listFathomConnections(member.workspaceId)
  }

  const connection =
    listed.connections.find((item) => fathomApiKey(item.secretRef)) ??
    listed.connections[0]

  if (!connection) {
    return { message: "Nie udało się utworzyć połączenia Fathom." }
  }

  const supabase = await createClient()
  const settings = await supabase
    .from("automation_settings")
    .select("fathom_poll_interval_minutes")
    .eq("workspace_id", member.workspaceId)
    .maybeSingle()
  const pollMinutes = settings.data?.fathom_poll_interval_minutes ?? 15

  const freshRange = formData.get("fresh") === "1"
  const result = await syncFathomConnection({
    actorId: member.id,
    connection,
    pollMinutes,
    freshRange,
  })
  refresh()
  return result
}

export async function retryMeetingContentAction(
  _state: FathomFormState,
  formData: FormData,
): Promise<FathomFormState> {
  const member = await actor()
  if (!member.ok) return { message: member.message }
  const meetingId = String(formData.get("meetingId") ?? "")
  const message = await rpc("reset_fathom_content_attempts", {
    p_actor_user_id: member.id,
    p_meeting_id: meetingId,
  })
  if (message) return { message }

  const supabase = await createClient()
  const [meeting, source] = await Promise.all([
    supabase
      .from("meeting_records")
      .select("recording_id, title, started_at")
      .eq("id", meetingId)
      .maybeSingle(),
    supabase
      .from("meeting_sources")
      .select("connection_id")
      .eq("meeting_record_id", meetingId)
      .limit(1)
      .maybeSingle(),
  ])
  const connection = source.data ? await getFathomConnection(source.data.connection_id) : null
  if (!meeting.data || !connection || connection.workspaceId !== member.workspaceId || !fathomApiKey(connection.secretRef)) {
    refresh()
    return {
      message:
        "Licznik prób został wyzerowany. Klucz API nie jest ustawiony, więc treść nie została pobrana z Fathoma.",
    }
  }

  const result = await retryFathomContent(connection.id, connection.secretRef, {
    recordingId: meeting.data.recording_id,
    title: meeting.data.title,
    startedAt: meeting.data.started_at,
  })
  refresh()
  return result
}
