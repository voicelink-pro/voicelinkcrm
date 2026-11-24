import {
  apiError,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
} from "@/lib/api/auth"
import { updateContactApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const { contactId } = await context.params

  if (!isUuid(contactId)) {
    return apiError(400, "invalid_id", "Identyfikator kontaktu musi być poprawnym UUID.", correlationId)
  }

  const parsed = await parseJsonBody(request, updateContactApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const body = parsed.data
  const hasCore =
    body.full_name !== undefined ||
    body.job_title !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined ||
    body.is_primary !== undefined

  if (!hasCore && body.archived === undefined) {
    return apiError(422, "validation_error", "Podaj przynajmniej jedno pole do aktualizacji.", correlationId)
  }

  try {
    const admin = createAdminClient()
    const { data: current, error } = await admin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać danych kontaktu.", correlationId)
    }
    if (!current) {
      return apiError(404, "not_found", "Nie znaleziono kontaktu.", correlationId)
    }

    let expectedVersion = body.version ?? current.version

    if (hasCore) {
      const rpc = await callAgentRpc<{ status: string; match_ids?: string[] }>(
        "update_contact",
        {
          p_actor_user_id: auth.actorUserId,
          p_contact_id: contactId,
          p_expected_version: expectedVersion,
          p_full_name: body.full_name ?? current.full_name,
          p_job_title: body.job_title !== undefined ? body.job_title : current.job_title,
          p_email: body.email !== undefined ? body.email : current.email,
          p_phone: body.phone !== undefined ? body.phone : current.phone_raw,
          p_is_primary: body.is_primary !== undefined ? body.is_primary : current.is_primary,
          p_confirm_duplicate: body.confirm_duplicate,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response

      if (rpc.data?.status === "possible_duplicate") {
        return apiError(
          409,
          "possible_duplicate",
          "Istnieje już inny kontakt z tym adresem e-mail lub telefonem. Przekaż confirm_duplicate: true, aby zapisać mimo to.",
          correlationId,
          { match_contact_ids: rpc.data.match_ids ?? [] },
        )
      }
      expectedVersion += 1
    }

    if (body.archived !== undefined) {
      const rpc = await callAgentRpc(
        "set_archived",
        {
          p_actor_user_id: auth.actorUserId,
          p_entity: "contact",
          p_id: contactId,
          p_expected_version: expectedVersion,
          p_archived: body.archived,
        },
        correlationId,
      )
      if (!rpc.ok) return rpc.response
    }

    const { data: fresh } = await admin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(fresh ?? current, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
