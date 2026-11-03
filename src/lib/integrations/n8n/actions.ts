"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { polishDatabaseError } from "@/lib/database/errors"
import { createAdminClient } from "@/lib/supabase/admin"

const resolveSchema = z.object({
  reviewId: z.string().uuid(),
  action: z.enum(["link", "dismiss"]),
  accountId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  dealId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
})

export type ReviewFormState = {
  error?: string
  savedAt?: number
}

export async function resolveReviewAction(
  _state: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do tego obszaru roboczego." }
  }

  const parsed = resolveSchema.safeParse({
    reviewId: formData.get("reviewId"),
    action: formData.get("action"),
    accountId: formData.get("accountId") ?? "",
    dealId: formData.get("dealId") ?? "",
  })

  if (!parsed.success) {
    return { error: "Wybierz kartę albo odrzuć zgłoszenie." }
  }

  if (parsed.data.action === "link" && !parsed.data.accountId) {
    return { error: "Wybierz kartę, do której dopiąć zgłoszenie." }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.schema("private").rpc("resolve_import_review", {
      p_actor_user_id: gate.userId,
      p_review_id: parsed.data.reviewId,
      p_action: parsed.data.action,
      p_account_id: parsed.data.accountId ?? undefined,
      p_deal_id: parsed.data.action === "link" ? (parsed.data.dealId ?? undefined) : undefined,
    })

    if (error) {
      return { error: polishDatabaseError(error) }
    }
  } catch {
    return { error: "Nie udało się zapisać zmiany." }
  }

  revalidatePath("/settings")
  revalidatePath("/leads")
  return { savedAt: Date.now() }
}
