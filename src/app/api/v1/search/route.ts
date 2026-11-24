import {
  apiError,
  apiOk,
  authenticateApiRequest,
  quoted,
  searchPattern,
} from "@/lib/api/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result
  const url = new URL(request.url)
  const rawQuery = (url.searchParams.get("q") ?? "").trim()
  const rawLimit = Number(url.searchParams.get("limit") ?? 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.trunc(rawLimit))) : 10

  const pattern = searchPattern(rawQuery)
  if (!pattern) {
    return apiOk(
      {
        query: rawQuery,
        clients: [],
        contacts: [],
        leads: [],
        tasks: [],
      },
      correlationId,
    )
  }

  try {
    const admin = createAdminClient()
    const like = quoted(pattern)

    const [accounts, contacts, deals, tasks] = await Promise.all([
      admin
        .from("accounts")
        .select("id, display_name, company_name, relationship, implementation_stage, service_status")
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .or(`display_name.ilike.${like},company_name.ilike.${like},nip.ilike.${like}`)
        .order("display_name")
        .limit(limit),
      admin
        .from("contacts")
        .select("id, account_id, full_name, email, phone_raw, phone_e164, is_primary")
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .or(`full_name.ilike.${like},email.ilike.${like},phone_e164.ilike.${like},phone_raw.ilike.${like}`)
        .order("full_name")
        .limit(limit),
      admin
        .from("lead_directory")
        .select("id, account_id, title, stage, contact_name, company_name, contact_email, contact_phone, owner_user_id")
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .or(
          `title.ilike.${like},contact_name.ilike.${like},company_name.ilike.${like},account_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like}`,
        )
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("tasks")
        .select("id, title, status, priority, due_on, account_id, deal_id")
        .eq("workspace_id", auth.workspaceId)
        .is("archived_at", null)
        .ilike("title", pattern)
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(limit),
    ])

    if (accounts.error || contacts.error || deals.error || tasks.error) {
      return apiError(500, "database_error", "Nie udało się przeszukać danych CRM.", correlationId)
    }

    return apiOk(
      {
        query: rawQuery,
        clients: accounts.data ?? [],
        contacts: contacts.data ?? [],
        leads: deals.data ?? [],
        tasks: tasks.data ?? [],
      },
      correlationId,
    )
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
