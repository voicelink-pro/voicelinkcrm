import {
  apiError,
  apiList,
  apiOk,
  authenticateApiRequest,
  callAgentRpc,
  isUuid,
  parseJsonBody,
  parsePagination,
} from "@/lib/api/auth"
import { createNoteApiSchema } from "@/lib/api/schemas"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const sp = url.searchParams
  const { limit, offset } = parsePagination(sp)

  const accountId = sp.get("account_id")?.trim() ?? ""
  const dealId = sp.get("deal_id")?.trim() ?? ""

  if (accountId && !isUuid(accountId)) {
    return apiError(422, "invalid_filter", "Parametr account_id musi być poprawnym UUID.", correlationId)
  }
  if (dealId && !isUuid(dealId)) {
    return apiError(422, "invalid_filter", "Parametr deal_id musi być poprawnym UUID.", correlationId)
  }

  try {
    const admin = createAdminClient()
    let query = admin
      .from("notes")
      .select("id, account_id, deal_id, body, created_at, updated_at, created_by, updated_by, version", {
        count: "exact",
      })
      .eq("workspace_id", auth.workspaceId)

    if (accountId) query = query.eq("account_id", accountId)
    if (dealId) query = query.eq("deal_id", dealId)

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać notatek.", correlationId)
    }

    return apiList(data ?? [], { total: count ?? 0, limit, offset }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}

export async function POST(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const parsed = await parseJsonBody(request, createNoteApiSchema, correlationId)
  if (!parsed.ok) return parsed.response

  const { body } = parsed.data
  let accountId = parsed.data.account_id ?? null
  const dealId = parsed.data.deal_id ?? null

  try {
    const admin = createAdminClient()

    if (dealId) {
      const { data: deal } = await admin
        .from("deals")
        .select("id, account_id")
        .eq("id", dealId)
        .eq("workspace_id", auth.workspaceId)
        .maybeSingle()

      if (!deal) {
        return apiError(404, "not_found", "Nie znaleziono wskazanego leada (deal_id).", correlationId)
      }
      if (accountId && deal.account_id !== accountId) {
        return apiError(
          422,
          "cross_reference",
          "Wskazany lead (deal_id) należy do innego klienta niż podany account_id.",
          correlationId,
        )
      }
      accountId = deal.account_id
    }

    if (!accountId) {
      return apiError(422, "validation_error", "Podaj account_id lub deal_id.", correlationId)
    }

    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    if (!account) {
      return apiError(404, "not_found", "Nie znaleziono wskazanego klienta (account_id).", correlationId)
    }

    const rpc = await callAgentRpc<string>(
      "add_note",
      {
        p_actor_user_id: auth.actorUserId,
        p_account_id: accountId,
        p_deal_id: dealId,
        p_body: body,
      },
      correlationId,
    )

    if (!rpc.ok) return rpc.response

    const { data: note } = await admin
      .from("notes")
      .select("id, account_id, deal_id, body, created_at, updated_at, created_by, updated_by, version")
      .eq("id", rpc.data)
      .eq("workspace_id", auth.workspaceId)
      .maybeSingle()

    return apiOk(note ?? { id: rpc.data, account_id: accountId, deal_id: dealId, body }, correlationId, 201)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
