import "server-only"

import { createClient } from "@/lib/supabase/server"

export type NotificationRow = {
  id: string
  kind: string
  title: string
  body: string | null
  targetPath: string | null
  readAt: string | null
  createdAt: string
}

export type DigestPreference = {
  morningDigestEnabled: boolean
  statusChange: boolean | null
  assignment: boolean | null
  reminder: boolean | null
  includeOverdue: boolean | null
}

export async function listNotifications() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, target_path, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return { rows: [] as NotificationRow[], message: "Nie udało się wczytać powiadomień." }
  }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      targetPath: row.target_path,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    message: null,
  }
}

export async function unreadNotificationCount() {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)

  if (error) {
    return 0
  }

  return count ?? 0
}

export async function loadDigestPreference(): Promise<DigestPreference> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("notification_preferences")
    .select(
      "morning_digest_enabled, status_change_enabled, assignment_enabled, reminder_enabled, include_overdue",
    )
    .limit(1)
    .maybeSingle()

  return {
    morningDigestEnabled: data?.morning_digest_enabled ?? true,
    statusChange: data?.status_change_enabled ?? null,
    assignment: data?.assignment_enabled ?? null,
    reminder: data?.reminder_enabled ?? null,
    includeOverdue: data?.include_overdue ?? null,
  }
}
