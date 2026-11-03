import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ImportCounts = {
  processed: number
  duplicate: number
  review: number
  invalid: number
  ignoredTest: number
  lastReceivedAt: string | null
  connectionStatus: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

export type ReviewItem = {
  id: string
  reason: string
  createdAt: string
  fullName: string
  email: string
  phone: string
  source: string
  sourceRecordId: string
}

const emptyCounts: ImportCounts = {
  processed: 0,
  duplicate: 0,
  review: 0,
  invalid: 0,
  ignoredTest: 0,
  lastReceivedAt: null,
  connectionStatus: null,
  lastSuccessAt: null,
  lastError: null,
}

export async function importOverview(workspaceId: string) {
  const admin = createAdminClient()
  const [events, connection, reviews] = await Promise.all([
    admin
      .schema("private")
      .from("inbound_events")
      .select("status, received_at")
      .eq("workspace_id", workspaceId)
      .order("received_at", { ascending: false })
      .limit(500),
    admin
      .schema("private")
      .from("integration_connections")
      .select("status, last_success_at, last_error")
      .eq("workspace_id", workspaceId)
      .eq("provider", "n8n_leads")
      .maybeSingle(),
    admin
      .schema("private")
      .from("import_review_items")
      .select("id, reason, payload, created_at, status")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const counts = { ...emptyCounts }
  for (const event of events.data ?? []) {
    if (event.status === "processed") counts.processed += 1
    if (event.status === "duplicate") counts.duplicate += 1
    if (event.status === "review") counts.review += 1
    if (event.status === "invalid") counts.invalid += 1
    if (event.status === "ignored_test") counts.ignoredTest += 1
  }
  counts.lastReceivedAt = events.data?.[0]?.received_at ?? null
  counts.connectionStatus = connection.data?.status ?? null
  counts.lastSuccessAt = connection.data?.last_success_at ?? null
  counts.lastError = connection.data?.last_error ?? null

  const openReviews: ReviewItem[] = (reviews.data ?? []).map((item) => {
    const payload = item.payload
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
    return {
      id: item.id,
      reason: item.reason,
      createdAt: item.created_at,
      fullName: text(record.full_name),
      email: text(record.email),
      phone: text(record.phone),
      source: text(record.source),
      sourceRecordId: text(record.source_record_id),
    }
  })

  return {
    counts,
    reviews: openReviews,
    error: events.error || connection.error || reviews.error ? "Nie udało się wczytać stanu integracji." : null,
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}
