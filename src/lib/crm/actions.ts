"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getWorkspaceGate } from "@/lib/auth/access"
import { safeInternalPath } from "@/lib/auth/return-to"
import { suggestFollowUpDue } from "@/lib/crm/follow-up"
import { formatDay } from "@/lib/crm/format"
import { callCrm } from "@/lib/crm/mutate"
import {
  accountSchema,
  archiveSchema,
  contactSchema,
  dealSchema,
  extraDealSchema,
  fieldErrorsFromZod,
  manualLeadSchema,
  mergeSchema,
  noteSchema,
  outcomeSchema,
  ownerSchema,
  stageSchema,
  taskSchema,
  type CrmFormState,
} from "@/lib/crm/validation"

function refreshCrm() {
  revalidatePath("/leads")
  revalidatePath("/clients")
  revalidatePath("/accounts")
  revalidatePath("/tasks")
}

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries())
}

export async function createLeadAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = manualLeadSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm<{ status: string; deal_id?: string }>("create_manual_lead", {
    p_actor_user_id: actor.id,
    p_full_name: parsed.data.fullName,
    p_company_name: parsed.data.companyName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_product_type: parsed.data.productType,
    p_title: parsed.data.title,
    p_owner_user_id: parsed.data.ownerUserId,
    p_confirm_duplicate: parsed.data.confirmDuplicate === "1",
  })

  if (saved.message) {
    return { error: saved.message }
  }

  if (saved.data?.status === "possible_duplicate") {
    return {
      duplicate: true,
      error: "Jest już kontakt z tym e-mailem albo telefonem. Nic nie zostało scalone.",
    }
  }

  refreshCrm()
  redirect(`/leads/${saved.data?.deal_id}`)
}

export async function changeStageAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = stageSchema.safeParse(formObject(formData))
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  if (parsed.data.stage === "won") {
    return {
      error:
        "Wygranie zapisuje się w finalizacji, która nalicza przychód.",
    }
  }
  if (parsed.data.stage === "lost" && !parsed.data.lostReason) {
    return { fieldErrors: { lostReason: "Podaj powód przegranej." } }
  }

  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("change_deal_stage", {
    p_actor_user_id: actor.id,
    p_deal_id: parsed.data.dealId,
    p_expected_version: parsed.data.version,
    p_stage: parsed.data.stage,
    p_lost_reason: parsed.data.lostReason,
  })

  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function assignOwnerAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = ownerSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("assign_deal_owner", {
    p_actor_user_id: actor.id,
    p_deal_id: parsed.data.dealId,
    p_expected_version: parsed.data.version,
    p_owner_user_id: parsed.data.ownerUserId,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function updateDealAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = dealSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("update_deal", {
    p_actor_user_id: actor.id,
    p_deal_id: parsed.data.dealId,
    p_expected_version: parsed.data.version,
    p_title: parsed.data.title,
    p_product_type: parsed.data.productType,
    p_primary_contact_id: parsed.data.primaryContactId,
    p_description: parsed.data.description,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function outcomeAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = outcomeSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  if (parsed.data.outcome === "no_answer" && !parsed.data.dueOn) {
    const suggested = await suggestFollowUpDue()
    if (!suggested) {
      return { fieldErrors: { dueOn: "Podaj termin ponownego kontaktu." } }
    }
  }
  if (parsed.data.outcome !== "no_answer" && !parsed.data.summary) {
    return { fieldErrors: { summary: "Opisz wynik kontaktu." } }
  }

  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm<{
    task_id?: string
    due_on?: string
    status?: string
  }>("record_contact_outcome", {
    p_actor_user_id: actor.id,
    p_deal_id: parsed.data.dealId,
    p_outcome: parsed.data.outcome,
    p_summary: parsed.data.summary,
    p_due_on: parsed.data.dueOn,
    p_action_key: parsed.data.actionKey,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  if (parsed.data.outcome === "no_answer" && saved.data?.task_id) {
    return {
      savedAt: Date.now(),
      notice: `Zapisano próbę kontaktu. Follow-up: ${formatDay(saved.data.due_on)}`,
      links: [
        { href: `/tasks/${saved.data.task_id}`, label: "Otwórz zadanie" },
        { href: `/tasks/${saved.data.task_id}#termin`, label: "Zmień termin" },
      ],
    }
  }
  return { savedAt: Date.now() }
}

export async function addNoteAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = noteSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("add_note", {
    p_actor_user_id: actor.id,
    p_account_id: parsed.data.accountId,
    p_deal_id: parsed.data.dealId,
    p_body: parsed.data.body,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function addTaskAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = taskSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("add_task", {
    p_actor_user_id: actor.id,
    p_account_id: parsed.data.accountId,
    p_deal_id: parsed.data.dealId,
    p_title: parsed.data.title,
    p_due_on: parsed.data.dueOn,
    p_assignee_ids: [actor.id],
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function addContactAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = contactSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  if (parsed.data.contactId) {
    const saved = await callCrm<{ status: string }>("update_contact", {
      p_actor_user_id: actor.id,
      p_contact_id: parsed.data.contactId,
      p_expected_version: parsed.data.version,
      p_full_name: parsed.data.fullName,
      p_job_title: parsed.data.jobTitle,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone,
      p_is_primary: parsed.data.isPrimary === "1",
      p_confirm_duplicate: parsed.data.confirmDuplicate === "1",
    })
    if (saved.message) return { error: saved.message }
    if (saved.data?.status === "possible_duplicate") {
      return {
        duplicate: true,
        error: "Jest już kontakt z tym e-mailem albo telefonem. Nic nie zostało scalone.",
      }
    }
  } else {
    const saved = await callCrm<{ status: string }>("add_contact", {
      p_actor_user_id: actor.id,
      p_account_id: parsed.data.accountId,
      p_full_name: parsed.data.fullName,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone,
      p_job_title: parsed.data.jobTitle,
      p_is_primary: parsed.data.isPrimary === "1",
      p_confirm_duplicate: parsed.data.confirmDuplicate === "1",
    })
    if (saved.message) return { error: saved.message }
    if (saved.data?.status === "possible_duplicate") {
      return {
        duplicate: true,
        error: "Jest już kontakt z tym e-mailem albo telefonem. Nic nie zostało scalone.",
      }
    }
  }

  refreshCrm()
  return { savedAt: Date.now() }
}

export async function addDealAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = extraDealSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm<string>("add_deal", {
    p_actor_user_id: actor.id,
    p_account_id: parsed.data.accountId,
    p_title: parsed.data.title,
    p_product_type: parsed.data.productType,
    p_primary_contact_id: parsed.data.primaryContactId,
    p_owner_user_id: parsed.data.ownerUserId,
  })
  if (saved.message || !saved.data) {
    return { error: saved.message ?? "Nie udało się zapisać zmiany." }
  }
  refreshCrm()
  redirect(`/leads/${saved.data}`)
}

export async function updateAccountAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = accountSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("update_account", {
    p_actor_user_id: actor.id,
    p_account_id: parsed.data.accountId,
    p_expected_version: parsed.data.version,
    p_display_name: parsed.data.displayName,
    p_company_name: parsed.data.companyName,
    p_kind: parsed.data.kind,
    p_website: parsed.data.website,
    p_nip: parsed.data.nip,
    p_address: parsed.data.address,
    p_service_status: parsed.data.serviceStatus,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now() }
}

export async function archiveAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = archiveSchema.safeParse(formObject(formData))
  if (!parsed.success) return { error: "Nie udało się zapisać zmiany." }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }
  const returnTo = safeInternalPath(String(formData.get("returnTo") ?? "/leads"))

  const saved = await callCrm("set_archived", {
    p_actor_user_id: actor.id,
    p_entity: parsed.data.entity,
    p_id: parsed.data.id,
    p_expected_version: parsed.data.version,
    p_archived: parsed.data.archived === "1",
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  redirect(returnTo)
}

export async function mergeAccountsAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = mergeSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm("merge_accounts", {
    p_actor_user_id: actor.id,
    p_source_id: parsed.data.sourceId,
    p_target_id: parsed.data.targetId,
    p_source_version: parsed.data.sourceVersion,
    p_target_version: parsed.data.targetVersion,
    p_keep_display_from: parsed.data.keepDisplayFrom,
    p_keep_company_from: parsed.data.keepCompanyFrom,
    p_keep_kind_from: parsed.data.keepKindFrom,
  })
  if (saved.message) return { error: saved.message }
  refreshCrm()
  redirect(`/accounts/${parsed.data.targetId}`)
}

export async function saveAccountDossierAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const accountId = String(formData.get("accountId") ?? "").trim()
  const section = String(formData.get("section") ?? "").trim()
  if (!accountId || (section !== "implementation" && section !== "integration")) {
    return { error: "Nieprawidłowe dane formularza." }
  }

  const dueOnRaw = String(formData.get("implementationDueOn") ?? "").trim()
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(dueOnRaw) ? dueOnRaw : null

  const saved = await callCrm("save_account_dossier", {
    p_actor_user_id: actor.id,
    p_account_id: accountId,
    p_section: section,
    p_implementation_notes:
      section === "implementation" ? String(formData.get("implementationNotes") ?? "") : null,
    p_integration_systems:
      section === "integration" ? String(formData.get("integrationSystems") ?? "") : null,
    p_integration_docs_status:
      section === "integration" ? String(formData.get("integrationDocsStatus") ?? "missing") : null,
    p_integration_notes:
      section === "integration" ? String(formData.get("integrationNotes") ?? "") : null,
    p_implementation_stage:
      section === "implementation" ? String(formData.get("implementationStage") ?? "in_progress") : null,
    p_implementation_due_on: section === "implementation" ? dueOn : null,
  })

  if (saved.message) return { error: saved.message }
  refreshCrm()
  return { savedAt: Date.now(), notice: "Zapisano zmiany w karcie klienta." }
}

async function actorId(): Promise<
  { ok: true; id: string } | { ok: false; message: string }
> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, message: "Brak dostępu do tego obszaru roboczego." }
  }
  return { ok: true, id: gate.userId }
}
