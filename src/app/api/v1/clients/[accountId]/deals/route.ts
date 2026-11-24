import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { addDealToClientApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { accountId } = await context.params

  if (!isUuid(accountId)) {
    return apiError(400, "invalid_id", "Identyfikator klienta musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, addDealToClientApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const admin = createAdminClient()

  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle()

  if (!account) {
    return apiError(404, "not_found", "Nie znaleziono klienta.", correlationId)
  }

  const rpc = await callAgentRpc<string>(
    "add_deal",
    {
      p_actor_user_id: auth.actorUserId,
      p_account_id: accountId,
      p_title: body.title,
      p_product_type: body.product_type ?? null,
      p_primary_contact_id: body.primary_contact_id ?? null,
      p_owner_user_id: body.owner_user_id ?? auth.actorUserId,
    },
    correlationId,
  )

  if (!rpc.ok) return rpc.response

  const { data: deal } = await admin
    .from("deals")
    .select("*")
    .eq("id", rpc.data)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle()

  return apiOk(deal ?? { id: rpc.data }, correlationId, 201)
}
