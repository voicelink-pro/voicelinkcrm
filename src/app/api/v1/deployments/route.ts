import {
  apiError,
  apiList,
  authenticateApiRequest,
  parsePagination,
  quoted,
  searchPattern,
} from "@/lib/api/auth"
import { IMPLEMENTATION_STAGE_CODES } from "@/lib/api/schemas"
import { warsawToday } from "@/lib/crm/finance"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const sp = url.searchParams
  const { limit, offset } = parsePagination(sp)

  const stage = sp.get("stage")?.trim() ?? ""
  const overdueOnly = sp.get("overdue") === "true"
  const pattern = searchPattern(sp.get("q"))

  try {
    const admin = createAdminClient()
    const today = await warsawToday()

    let query = admin
      .from("accounts")
      .select(
        "id, display_name, company_name, service_status, implementation_stage, implementation_due_on, implementation_notes, integration_systems, integration_docs_status, integration_notes, version, updated_at",
        { count: "exact" },
      )
      .eq("workspace_id", auth.workspaceId)
      .eq("relationship", "client")
      .is("archived_at", null)

    if (stage) {
      if (!IMPLEMENTATION_STAGE_CODES.includes(stage)) {
        return apiError(
          422,
          "invalid_filter",
          `Nieznany etap wdrożenia: ${stage}.`,
          correlationId,
        )
      }
      query = query.eq("implementation_stage", stage)
    }

    if (overdueOnly) {
      query = query
        .not("implementation_stage", "in", "(completed,launched)")
        .lt("implementation_due_on", today)
    }

    if (pattern) {
      const value = quoted(pattern)
      query = query.or(
        `display_name.ilike.${value},company_name.ilike.${value},integration_systems.ilike.${value}`,
      )
    }

    const { data, error, count } = await query
      .order("implementation_due_on", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError(500, "database_error", "Nie udało się pobrać listy wdrożeń.", correlationId)
    }

    const items = (data ?? []).map((row) => ({
      account_id: row.id,
      display_name: row.display_name,
      company_name: row.company_name,
      service_status: row.service_status,
      implementation_stage: row.implementation_stage,
      implementation_due_on: row.implementation_due_on,
      is_overdue:
        Boolean(row.implementation_due_on) &&
        row.implementation_due_on! < today &&
        row.implementation_stage !== "completed" &&
        row.implementation_stage !== "launched",
      implementation_notes: row.implementation_notes,
      integration_systems: row.integration_systems,
      integration_docs_status: row.integration_docs_status,
      integration_notes: row.integration_notes,
      version: row.version,
      updated_at: row.updated_at,
    }))

    return apiList(items, { total: count ?? 0, limit, offset }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
