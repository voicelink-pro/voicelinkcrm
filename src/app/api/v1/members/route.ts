import { apiError, apiList, authenticateApiRequest } from "@/lib/api/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result

  try {
    const admin = createAdminClient()
    const [{ data: members, error: membersErr }, { data: profiles, error: profilesErr }] =
      await Promise.all([
        admin
          .from("workspace_members")
          .select("user_id, role, active, created_at")
          .eq("workspace_id", auth.workspaceId)
          .eq("active", true)
          .order("created_at", { ascending: true }),
        admin
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .eq("workspace_id", auth.workspaceId),
      ])

    if (membersErr || profilesErr) {
      return apiError(500, "database_error", "Nie udało się pobrać listy członków zespołu.", correlationId)
    }

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.user_id,
        { fullName: p.full_name, avatarUrl: p.avatar_url ?? null },
      ]),
    )

    const items = (members ?? []).map((m) => {
      const profile = profileMap.get(m.user_id)
      return {
        user_id: m.user_id,
        full_name: profile?.fullName ?? "Użytkownik",
        role: m.role === "admin" ? "admin" : "member",
        avatar_url: profile?.avatarUrl ?? null,
        is_current_actor: m.user_id === auth.actorUserId,
      }
    })

    return apiList(items, { total: items.length, limit: items.length, offset: 0 }, correlationId)
  } catch {
    return apiError(503, "unavailable", "Baza danych jest chwilowo niedostępna.", correlationId)
  }
}
