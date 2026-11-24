import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateLeadApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { dealId } = await context.params

  if (!isUuid(dealId)) {
    return apiError(400, "invalid_id", "Identyfikator leada musi być poprawnym UUID.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data: deal, error: dealErr } = await admin
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (dealErr) {
      return apiError(500, "database_error", "Nie udało się pobrać danych leada.", correlationId)
    }
    if (!deal) {
      return apiError(404, "not_found", "Nie znaleziono leada.", correlationId)
    }

    const [account, contacts, history, activities, notes, tasks] = await Promise.all([
      admin
        .from("accounts")
        .select("*")
        .eq("id", deal.account_id)
        .eq("workspace_id", auth.workspaceId)
        .maybeSingle(),
      admin
        .from("contacts")
        .select("id, full_name, job_title, email, phone_raw, phone_e164, is_primary, version, archived_at")
        .eq("account_id", deal.account_id)
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .order("is_primary", { ascending: false })
        .order("full_name"),
      admin
        .from("deal_stage_history")
        .select("id, from_stage, to_stage, changed_at, actor_user_id")
        .eq("deal_id", deal.id)
        .eq("workspace_id", auth.workspaceId)
        .order("changed_at", { ascending: false })
        .limit(50),
      admin
        .from("activities")
        .select("id, activity_type, occurred_at, actor_user_id, payload")
        .eq("deal_id", deal.id)
        .eq("workspace_id", auth.workspaceId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      admin
        .from("notes")
        .select("id, account_id, deal_id, body, created_at, updated_at, created_by")
        .eq("account_id", deal.account_id)
        .eq("workspace_id", auth.workspaceId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("tasks")
        .select("id, title, description, due_on, due_at, status, priority, kind, version, completed_at")
        .eq("deal_id", deal.id)
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(50),
    ])

    return apiOk(
      {
        deal,
        account: account.data ?? null,
        contacts: contacts.data ?? [],
        stage_history: history.data ?? [],
        activities: activities.data ?? [],
        notes: notes.data ?? [],
        tasks: tasks.data ?? [],
      },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { dealId } = await context.params

  if (!isUuid(dealId)) {
    return apiError(400, "invalid_id", "Identyfikator leada musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, updateLeadApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const hasAnyField =
    body.title !== undefined ||
    body.product_type !== undefined ||
    body.primary_contact_id !== undefined ||
    body.description !== undefined ||
    body.owner_user_id !== undefined ||
    body.stage !== undefined ||
    body.archived !== undefined

  if (!hasAnyField) {
    return apiError(422, "validation_error", "Podaj przynajmniej jedno pole do aktualizacji.", correlationId)
  }

  if (body.stage === "lost" && !body.lost_reason) {
    return apiError(
      422,
      "validation_error",
      "Zmiana etapu na 'lost' wymaga podania lost_reason.",
      correlationId,
      { fields: { lost_reason: "Podaj powód przegranej." } },
    )
  }

  try {
    const admin = createAdminClient()
    const { data: current, error: loadErr } = await admin
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (loadErr) {
      return apiError(500, "database_error", "Nie udało się pobrać danych leada.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono leada.", correlationId)
    }

    let expectedVersion = body.version ?? current.version

    const hasCoreFields =
      body.title !== undefined ||
      body.product_type !== undefined ||
      body.primary_contact_id !== undefined ||
      body.description !== undefined

    if (hasCoreFields) {
      const updated = await callAgentRpc(
        "update_deal",
        {
          p_actor_user_id: auth.actorUserId,
          p_deal_id: dealId,
          p_expected_version: expectedVersion,
          p_title: body.title ?? current.title,
          p_product_type:
            body.product_type !== undefined ? body.product_type : current.product_type,
          p_primary_contact_id:
            body.primary_contact_id !== undefined
              ? body.primary_contact_id
              : current.primary_contact_id,
          p_description:
            body.description !== undefined ? body.description : current.description,
        },
        correlationId,
      )
      if (!updated.ok) return updated.response
      expectedVersion += 1
    }

    if (body.owner_user_id !== undefined) {
      const assigned = await callAgentRpc(
        "assign_deal_owner",
        {
          p_actor_user_id: auth.actorUserId,
          p_deal_id: dealId,
          p_expected_version: expectedVersion,
          p_owner_user_id: body.owner_user_id,
        },
        correlationId,
      )
      if (!assigned.ok) return assigned.response
      expectedVersion += 1
    }

    if (body.stage !== undefined) {
      const staged = await callAgentRpc(
        "change_deal_stage",
        {
          p_actor_user_id: auth.actorUserId,
          p_deal_id: dealId,
          p_expected_version: expectedVersion,
          p_stage: body.stage,
          p_lost_reason: body.lost_reason ?? null,
        },
        correlationId,
      )
      if (!staged.ok) return staged.response
      expectedVersion += 1
    }

    if (body.archived !== undefined) {
      const archivedRes = await callAgentRpc(
        "set_archived",
        {
          p_actor_user_id: auth.actorUserId,
          p_entity: "deal",
          p_id: dealId,
          p_expected_version: expectedVersion,
          p_archived: body.archived,
        },
        correlationId,
      )
      if (!archivedRes.ok) return archivedRes.response
    }

    const { data: fresh } = await admin
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(fresh ?? current, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
