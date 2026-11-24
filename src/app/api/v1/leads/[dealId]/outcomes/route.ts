import { randomUUID } from "node:crypto"

import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { leadOutcomeApiSchema } from "@/lib/api/schemas"
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

  const parsed = await parseJsonBody(request, leadOutcomeApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const { outcome, summary, due_on, action_key } = parsed.data

  if (outcome !== "no_answer" && !summary) {
    return apiError(
      422,
      "validation_error",
      "Dla wyniku innego niż 'no_answer' podaj podsumowanie (summary).",
      correlationId,
      { fields: { summary: "Opisz wynik kontaktu." } },
    )
  }

  try {
    const admin = createAdminClient()
    const { data: deal } = await admin
      .from("deals")
      .select("id")
      .eq("id", dealId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (!deal) {
      return apiError(404, "not_found", "Nie znaleziono leada.", correlationId)
    }

    const rpc = await callAgentRpc<{
      status?: string
      activity_id?: string
      task_id?: string
      due_on?: string
      deal_id?: string
    }>(
      "record_contact_outcome",
      {
        p_actor_user_id: auth.actorUserId,
        p_deal_id: dealId,
        p_outcome: outcome,
        p_summary: summary ?? null,
        p_due_on: due_on ?? null,
        p_action_key: action_key ?? `api:${randomUUID()}`,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    return apiOk(rpc.data, correlationId, 201)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
