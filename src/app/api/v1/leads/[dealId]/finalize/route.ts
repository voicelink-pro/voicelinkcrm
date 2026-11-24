import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { finalizeLeadApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function POST(
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

  const parsed = await parseJsonBody(request, finalizeLeadApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  if (body.monthly_amount_cents > 0 && !body.subscription_starts_on) {
    return apiError(
      422,
      "validation_error",
      "Przy kwocie abonamentu > 0 podaj datę startu (subscription_starts_on).",
      correlationId,
      { fields: { subscription_starts_on: "Podaj datę rozpoczęcia abonamentu." } },
    )
  }

  try {
    const admin = createAdminClient()
    const { data: deal } = await admin
      .from("deals")
      .select("id, version")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .is("archived_at", null)
      .maybeSingle()

    if (!deal) {
      return apiError(404, "not_found", "Nie znaleziono leada.", correlationId)
    }

    const rpc = await callAgentRpc(
      "finalize_deal",
      {
        p_actor_user_id: auth.actorUserId,
        p_deal_id: dealId,
        p_expected_version: body.version ?? deal.version,
        p_setup_amount_cents: body.setup_amount_cents,
        p_setup_on: body.setup_on,
        p_monthly_amount_cents: body.monthly_amount_cents,
        p_subscription_starts_on:
          body.monthly_amount_cents > 0 ? body.subscription_starts_on : undefined,
        p_subscription_ends_on: body.subscription_ends_on ?? undefined,
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

    return apiOk({ deal: updated }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
