"use server"

import { revalidatePath } from "next/cache"

import { getWorkspaceGate } from "@/lib/auth/access"
import { polishDatabaseError } from "@/lib/database/errors"
import { callCrm } from "@/lib/crm/mutate"
import { createAdminClient } from "@/lib/supabase/admin"

export type MeetingFormState = { message?: string }

async function actorId() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false as const, message: "Brak dostępu do tego obszaru roboczego." }
  }
  return { ok: true as const, id: gate.userId }
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
  revalidatePath("/meetings")
  revalidatePath("/accounts")
  revalidatePath("/leads")
}

export async function addMeetingNoteAction(
  _state: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const actor = await actorId()
  if (!actor.ok) return { message: actor.message }
  const message = await rpc("add_meeting_note", {
    p_actor_user_id: actor.id,
    p_meeting_id: String(formData.get("meetingId") ?? ""),
    p_body: String(formData.get("body") ?? ""),
  })
  if (!message) refresh()
  return { message: message ?? "Zapisano notatkę." }
}

export async function attachMeetingLinkAction(
  _state: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const actor = await actorId()
  if (!actor.ok) return { message: actor.message }
  const dealId = String(formData.get("dealId") ?? "")
  const message = await rpc("attach_meeting_link", {
    p_actor_user_id: actor.id,
    p_meeting_id: String(formData.get("meetingId") ?? ""),
    p_account_id: String(formData.get("accountId") ?? ""),
    p_deal_id: dealId || null,
  })
  if (!message) refresh()
  return { message: message ?? "Zapisano powiązanie." }
}

export async function detachMeetingLinkAction(formData: FormData) {
  const actor = await actorId()
  if (!actor.ok) return
  const message = await rpc("detach_meeting_link", {
    p_actor_user_id: actor.id,
    p_meeting_id: String(formData.get("meetingId") ?? ""),
    p_link_id: String(formData.get("linkId") ?? ""),
  })
  if (!message) refresh()
}

export async function createTaskFromActionItemAction(
  _state: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const actor = await actorId()
  if (!actor.ok) return { message: actor.message }
  const accountId = String(formData.get("accountId") ?? "")
  const assigneeId = String(formData.get("assigneeId") ?? "")
  const dueOn = String(formData.get("dueOn") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  if (!accountId || !assigneeId || !dueOn || !title) {
    return { message: "Wybierz firmę, osobę i termin. Zadanie nie zostało utworzone." }
  }

  const saved = await callCrm<string>("save_task", {
    p_actor_user_id: actor.id,
    p_task_id: null,
    p_expected_version: null,
    p_title: title,
    p_description: String(formData.get("description") ?? ""),
    p_due_on: dueOn,
    p_due_time: null,
    p_priority: "normal",
    p_status: "todo",
    p_account_id: accountId,
    p_deal_id: String(formData.get("dealId") ?? "") || null,
    p_deployment_id: null,
    p_assignee_ids: [assigneeId],
  })

  if (saved.message) return { message: saved.message }
  refresh()
  revalidatePath("/tasks")
  return { message: "Utworzono zadanie z propozycji." }
}
