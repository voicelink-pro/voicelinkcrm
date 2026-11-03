"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { previewSchedule, warsawToday } from "@/lib/crm/finance"
import { callCrm } from "@/lib/crm/mutate"
import { parseGrosze } from "@/lib/crm/money"
import { fieldErrorsFromZod, type CrmFormState } from "@/lib/crm/validation"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę.")
const money = z.string().trim().min(1, "Podaj kwotę brutto. Zero jest dozwolone.")

const finalizeSchema = z.object({
  dealId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  setupAmount: money,
  monthlyAmount: money,
  setupOn: day,
  subscriptionStartsOn: z.string().optional().or(z.literal("")),
  subscriptionEndsOn: z.string().optional().or(z.literal("")),
})

const endSchema = z.object({
  agreementId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  endsOn: day,
})

const reviseSchema = z.object({
  agreementId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  fromCycle: z.coerce.number().int().positive(),
  amount: money,
})

const replaceSchema = z.object({
  entryId: z.string().uuid(),
  amount: money,
  reason: z.string().trim().min(1, "Podaj powód korekty.").max(500),
})

const revertSchema = z.object({
  dealId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  stage: z.enum([
    "new",
    "contact_attempt",
    "conversation_done",
    "meeting_scheduled",
    "meeting_done",
    "offer_sent",
    "negotiation",
    "lost",
  ]),
  lostReason: z.string().trim().max(500).optional().or(z.literal("")),
  confirm: z.literal("1", { error: "Potwierdź cofnięcie finalizacji." }),
})

function refresh(dealId?: string) {
  revalidatePath("/leads")
  revalidatePath("/clients")
  revalidatePath("/accounts")
  if (dealId) {
    revalidatePath(`/leads/${dealId}`)
  }
}

async function actorId() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return null
  }
  return gate.userId
}

function centsOrError(value: string, field: string) {
  const cents = parseGrosze(value)
  if (cents == null) {
    return { cents: null, error: { [field]: "Podaj kwotę brutto w złotych, z groszami albo bez." } }
  }
  return { cents, error: null }
}

export async function loadSchedulePreview(startsOn: string, endsOn: string) {
  const today = await warsawToday()
  const anchor = Number(startsOn.slice(8, 10))
  const rows = await previewSchedule(startsOn, anchor, endsOn || null, today)
  return { today, rows }
}

export async function finalizeDealAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = finalizeSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  const setup = centsOrError(parsed.data.setupAmount, "setupAmount")
  const monthly = centsOrError(parsed.data.monthlyAmount, "monthlyAmount")
  if (setup.cents == null || monthly.cents == null) {
    return { fieldErrors: { ...setup.error, ...monthly.error } }
  }

  const starts = parsed.data.subscriptionStartsOn?.trim() ?? ""
  const ends = parsed.data.subscriptionEndsOn?.trim() ?? ""
  if (monthly.cents > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(starts)) {
    return { fieldErrors: { subscriptionStartsOn: "Podaj datę rozpoczęcia abonamentu." } }
  }
  if (ends && !/^\d{4}-\d{2}-\d{2}$/.test(ends)) {
    return { fieldErrors: { subscriptionEndsOn: "Podaj datę zakończenia albo zostaw puste." } }
  }

  const actor = await actorId()
  if (!actor) return { error: "Brak dostępu do tego obszaru roboczego." }

  const saved = await callCrm("finalize_deal", {
    p_actor_user_id: actor,
    p_deal_id: parsed.data.dealId,
    p_expected_version: parsed.data.version,
    p_setup_amount_cents: setup.cents,
    p_setup_on: parsed.data.setupOn,
    p_monthly_amount_cents: monthly.cents,
    p_subscription_starts_on: monthly.cents > 0 ? starts : undefined,
    p_subscription_ends_on: ends || undefined,
  })

  if (saved.message) return { error: saved.message }
  refresh(parsed.data.dealId)
  return { savedAt: Date.now() }
}

export async function endSubscriptionAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = endSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor) return { error: "Brak dostępu do tego obszaru roboczego." }

  const saved = await callCrm("end_subscription", {
    p_actor_user_id: actor,
    p_agreement_id: parsed.data.agreementId,
    p_expected_version: parsed.data.version,
    p_ends_on_exclusive: parsed.data.endsOn,
  })
  if (saved.message) return { error: saved.message }
  refresh()
  return { savedAt: Date.now() }
}

export async function reviseSubscriptionAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = reviseSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const amount = centsOrError(parsed.data.amount, "amount")
  if (amount.error || amount.cents == null) return { fieldErrors: amount.error ?? {} }
  const actor = await actorId()
  if (!actor) return { error: "Brak dostępu do tego obszaru roboczego." }

  const saved = await callCrm("revise_subscription_amount", {
    p_actor_user_id: actor,
    p_agreement_id: parsed.data.agreementId,
    p_expected_version: parsed.data.version,
    p_from_cycle_index: parsed.data.fromCycle,
    p_new_amount_cents: amount.cents,
  })
  if (saved.message) return { error: saved.message }
  refresh()
  return { savedAt: Date.now() }
}

export async function replaceRevenueAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = replaceSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const amount = centsOrError(parsed.data.amount, "amount")
  if (amount.error || amount.cents == null) return { fieldErrors: amount.error ?? {} }
  const actor = await actorId()
  if (!actor) return { error: "Brak dostępu do tego obszaru roboczego." }

  const saved = await callCrm("replace_revenue_entry", {
    p_actor_user_id: actor,
    p_entry_id: parsed.data.entryId,
    p_amount_cents: amount.cents,
    p_reason: parsed.data.reason,
  })
  if (saved.message) return { error: saved.message }
  refresh()
  return { savedAt: Date.now() }
}

export async function revertFinalizationAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = revertSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  if (parsed.data.stage === "lost" && !parsed.data.lostReason) {
    return { fieldErrors: { lostReason: "Podaj powód przegranej." } }
  }
  const actor = await actorId()
  if (!actor) return { error: "Brak dostępu do tego obszaru roboczego." }

  const saved = await callCrm("revert_deal_finalization", {
    p_actor_user_id: actor,
    p_deal_id: parsed.data.dealId,
    p_expected_version: parsed.data.version,
    p_target_stage: parsed.data.stage,
    p_lost_reason: parsed.data.stage === "lost" ? parsed.data.lostReason : undefined,
  })
  if (saved.message) return { error: saved.message }
  refresh(parsed.data.dealId)
  return { savedAt: Date.now() }
}
