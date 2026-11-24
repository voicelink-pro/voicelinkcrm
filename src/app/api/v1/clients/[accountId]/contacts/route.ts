import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { createContactApiSchema } from "@/lib/api/schemas"
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

  const parsed = await parseJsonBody(request, createContactApiSchema, correlationId)
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

  const rpc = await callAgentRpc<{
    status: string
    contact_id?: string
    match_ids?: string[]
  }>(
    "add_contact",
    {
      p_actor_user_id: auth.actorUserId,
      p_account_id: accountId,
      p_full_name: body.full_name,
      p_email: body.email ?? null,
      p_phone: body.phone ?? null,
      p_job_title: body.job_title ?? null,
      p_is_primary: body.is_primary,
      p_confirm_duplicate: body.confirm_duplicate,
    },
    correlationId,
  )

  if (!rpc.ok) return rpc.response

  if (rpc.data?.status === "possible_duplicate") {
    return apiError(
      409,
      "possible_duplicate",
      "Istnieje już kontakt o tym adresie e-mail lub numerze telefonu. Przekaż confirm_duplicate: true, aby mimo to dodać kontakt.",
      correlationId,
      { match_contact_ids: rpc.data.match_ids ?? [] },
    )
  }

  const contactId = rpc.data?.contact_id
  if (contactId) {
    const { data: contact } = await admin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()
    if (contact) {
      return apiOk(contact, correlationId, 201)
    }
  }

  return apiOk(rpc.data, correlationId, 201)
}
