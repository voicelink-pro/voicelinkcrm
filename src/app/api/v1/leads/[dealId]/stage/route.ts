import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { changeLeadStageApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

async function handleStageChange(
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

  const parsed = await parseJsonBody(request, changeLeadStageApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const { stage, lost_reason, version } = parsed.data

  if (stage === "won") {
    return apiError(
      422,
      "finalization_required",
      "Etap 'won' wymaga finalizacji z warunkami finansowymi — użyj POST /api/v1/leads/{dealId}/finalize.",
      correlationId,
    )
  }

  if (stage === "lost" && !lost_reason) {
    return apiError(
      422,
      "validation_error",
      "Zmiana etapu na 'lost' wymaga podania powodu przegranej (lost_reason).",
      correlationId,
      { fields: { lost_reason: "Podaj powód przegranej." } },
    )
  }

  try {
    const admin = createAdminClient()
    const { data: deal, error } = await admin
      .from("deals")
      .select("id, version, stage, account_id")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .is("archived_at", null)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać leada.", correlationId)
    }
    if (!deal) {
      return apiError(404, "not_found", "Nie znaleziono leada.", correlationId)
    }

    const expectedVersion = version ?? deal.version
    const rpc = await callAgentRpc(
      "change_deal_stage",
      {
        p_actor_user_id: auth.actorUserId,
        p_deal_id: dealId,
        p_expected_version: expectedVersion,
        p_stage: stage,
        p_lost_reason: lost_reason ?? null,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const { data: updated } = await admin
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(
      {
        deal: updated,
        previous_stage: deal.stage,
        current_stage: updated?.stage ?? stage,
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
  return handleStageChange(request, context)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  return handleStageChange(request, context)
}
