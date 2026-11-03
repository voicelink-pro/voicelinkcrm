import "server-only"

import { leadPageSize, type LeadQuery } from "@/lib/crm/lead-query"
import { nextCalendarDay, warsawMidnightIso } from "@/lib/integrations/fathom/range"
import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"

export type LeadRow = Tables<"lead_directory">
export type ClientRow = Tables<"client_directory">
export type MemberOption = {
  userId: string
  fullName: string
  avatarUrl: string | null
}

const readError = "Nie udało się wczytać danych."

function searchPattern(value: string) {
  const cleaned = value.replace(/[%_,.*()"\\]/g, " ").replace(/\s+/g, " ").trim()
  if (!cleaned) {
    return null
  }

  return `%${cleaned}%`
}

function quoted(pattern: string) {
  return `"${pattern.replaceAll('"', "")}"`
}

export async function listMembers(): Promise<MemberOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url")
    .order("full_name")

  if (error) {
    return []
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url ?? null,
  }))
}

export async function listLeads(query: LeadQuery) {
  const supabase = await createClient()
  const from = (query.page - 1) * leadPageSize
  let request = supabase.from("lead_directory").select("*", { count: "exact" })

  if (!query.archived) {
    request = request.is("archived_at", null).is("account_archived_at", null)
  }
  if (query.stage) {
    request = request.eq("stage", query.stage)
  }
  if (query.product) {
    request = request.eq("product_type", query.product)
  }
  if (query.owner === "none") {
    request = request.is("owner_user_id", null)
  } else if (query.owner) {
    request = request.eq("owner_user_id", query.owner)
  }
  if (query.source) {
    request = request.eq("source", query.source)
  }
  if (query.createdFrom) {
    request = request.gte("created_at", warsawMidnightIso(query.createdFrom))
  }
  if (query.createdTo) {
    request = request.lt("created_at", warsawMidnightIso(nextCalendarDay(query.createdTo)))
  }
  if (query.wonFrom) {
    request = request.gte("won_at", warsawMidnightIso(query.wonFrom))
  }
  if (query.wonTo) {
    request = request.lt("won_at", warsawMidnightIso(nextCalendarDay(query.wonTo)))
  }
  if (query.lostFrom) {
    request = request.gte("lost_at", warsawMidnightIso(query.lostFrom))
  }
  if (query.lostTo) {
    request = request.lt("lost_at", warsawMidnightIso(nextCalendarDay(query.lostTo)))
  }

  const pattern = searchPattern(query.q)
  if (pattern) {
    const value = quoted(pattern)
    request = request.or(
      [
        `title.ilike.${value}`,
        `contact_name.ilike.${value}`,
        `company_name.ilike.${value}`,
        `account_name.ilike.${value}`,
        `contact_email.ilike.${value}`,
        `contact_phone.ilike.${value}`,
      ].join(","),
    )
  }

  request = request
    .order(query.sort, { ascending: query.dir === "asc", nullsFirst: false })
    .order("id", { ascending: false })

  request =
    query.view === "kanban" ? request.limit(300) : request.range(from, from + leadPageSize - 1)

  const { data, error, count } = await request

  return {
    rows: data ?? [],
    count: count ?? 0,
    error: error ? readError : null,
  }
}

export async function listClients(input: {
  q: string
  service: string
  archived: boolean
  page: number
}) {
  const supabase = await createClient()
  const from = (input.page - 1) * leadPageSize
  let request = supabase.from("client_directory").select("*", { count: "exact" })

  if (!input.archived) {
    request = request.is("archived_at", null)
  }
  if (input.service === "active" || input.service === "inactive") {
    request = request.eq("service_status", input.service)
  }

  const pattern = searchPattern(input.q)
  if (pattern) {
    const value = quoted(pattern)
    request = request.or(
      [
        `display_name.ilike.${value}`,
        `company_name.ilike.${value}`,
        `primary_contact_name.ilike.${value}`,
      ].join(","),
    )
  }

  const { data, error, count } = await request
    .order("display_name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + leadPageSize - 1)

  return {
    rows: data ?? [],
    count: count ?? 0,
    error: error ? readError : null,
  }
}

export async function getDeal(dealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle()

  if (error) {
    return { deal: null, error: readError }
  }

  return { deal: data, error: null }
}

export async function getAccount(accountId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle()

  if (error) {
    return { account: null, error: readError }
  }

  return { account: data, error: null }
}

export async function getDealContext(dealId: string, accountId: string) {
  const supabase = await createClient()
  const [
    account,
    contacts,
    history,
    activities,
    notes,
    tasks,
    meetingLinks,
  ] = await Promise.all([
    supabase.from("accounts").select("*").eq("id", accountId).maybeSingle(),
    supabase
      .from("contacts")
      .select("id, full_name, job_title, email, phone_raw, is_primary, version, archived_at")
      .eq("account_id", accountId)
      .order("is_primary", { ascending: false })
      .order("full_name"),
    supabase
      .from("deal_stage_history")
      .select("id, from_stage, to_stage, changed_at, actor_user_id")
      .eq("deal_id", dealId)
      .order("changed_at", { ascending: false }),
    supabase
      .from("activities")
      .select("id, activity_type, occurred_at, actor_user_id, payload")
      .eq("deal_id", dealId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("notes")
      .select("id, body, created_at, created_by")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, due_on, status, kind, archived_at")
      .eq("deal_id", dealId)
      .order("due_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("meeting_links")
      .select("id, meeting_record_id, deal_id")
      .eq("account_id", accountId),
  ])

  const meetingIds = (meetingLinks.data ?? []).map((link) => link.meeting_record_id)
  const meetings = meetingIds.length
    ? await supabase
        .from("meeting_records")
        .select("id, title, started_at, sync_status")
        .in("id", meetingIds)
        .order("started_at", { ascending: false })
    : { data: [] }

  const failed = [
    account.error,
    contacts.error,
    history.error,
    activities.error,
    notes.error,
    tasks.error,
    meetingLinks.error,
  ].some(Boolean)

  return {
    account: account.data,
    contacts: contacts.data ?? [],
    history: history.data ?? [],
    activities: activities.data ?? [],
    notes: notes.data ?? [],
    tasks: tasks.data ?? [],
    meetings: meetings.data ?? [],
    error: failed ? readError : null,
  }
}

export async function getAccountContext(accountId: string) {
  const supabase = await createClient()
  const [contacts, deals, notes, tasks, meetingLinks, revenue] =
    await Promise.all([
      supabase
        .from("contacts")
        .select(
          "id, full_name, job_title, email, phone_raw, email_normalized, phone_e164, is_primary, version, archived_at",
        )
        .eq("account_id", accountId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("deals")
        .select(
          "id, title, stage, product_type, version, archived_at, owner_user_id, created_by, setup_amount_gross_cents, monthly_amount_gross_cents",
        )
        .eq("account_id", accountId)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("id, body, created_at, created_by, deal_id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, due_on, status, archived_at")
        .eq("account_id", accountId)
        .order("due_on", { ascending: true, nullsFirst: false }),
      supabase.from("meeting_links").select("meeting_record_id").eq("account_id", accountId),
      supabase
        .from("revenue_entries")
        .select("id, entry_type, effective_on, amount_signed_cents, deal_id")
        .eq("account_id", accountId)
        .order("effective_on", { ascending: false }),
    ])

  const meetingIds = (meetingLinks.data ?? []).map((link) => link.meeting_record_id)
  const meetings = meetingIds.length
    ? await supabase
        .from("meeting_records")
        .select("id, title, started_at")
        .in("id", meetingIds)
        .order("started_at", { ascending: false })
    : { data: [] }

  const emails = (contacts.data ?? [])
    .map((contact) => contact.email_normalized)
    .filter((value): value is string => Boolean(value))
  const phones = (contacts.data ?? [])
    .map((contact) => contact.phone_e164)
    .filter((value): value is string => Boolean(value))

  let duplicates: {
    id: string
    displayName: string
    companyName: string | null
    kind: string
    version: number
    relationship: string
  }[] = []

  if (emails.length || phones.length) {
    const filters = [
      emails.length ? `email_normalized.in.(${emails.join(",")})` : "",
      phones.length ? `phone_e164.in.(${phones.join(",")})` : "",
    ]
      .filter(Boolean)
      .join(",")
    const matches = await supabase
      .from("contacts")
      .select("account_id")
      .neq("account_id", accountId)
      .is("archived_at", null)
      .or(filters)

    const ids = [...new Set((matches.data ?? []).map((row) => row.account_id))]
    if (ids.length) {
      const accounts = await supabase
        .from("accounts")
        .select("id, display_name, company_name, kind, version, relationship")
        .in("id", ids)
        .is("archived_at", null)
      duplicates = (accounts.data ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        companyName: row.company_name,
        kind: row.kind,
        version: row.version,
        relationship: row.relationship,
      }))
    }
  }

  return {
    contacts: contacts.data ?? [],
    deals: deals.data ?? [],
    notes: notes.data ?? [],
    tasks: tasks.data ?? [],
    meetings: meetings.data ?? [],
    revenue: revenue.data ?? [],
    duplicates,
    error: [contacts.error, deals.error, notes.error, revenue.error].some(Boolean)
      ? readError
      : null,
  }
}

export async function listFinance(accountId: string) {
  const supabase = await createClient()
  const [agreements, entries] = await Promise.all([
    supabase
      .from("billing_agreements")
      .select(
        "id, deal_id, kind, amount_gross_cents, starts_on, anchor_day, ends_on_exclusive, status, version",
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("revenue_entries")
      .select(
        "id, deal_id, entry_type, cycle_index, effective_on, amount_signed_cents, reason, created_at, superseded_at, reverses_entry_id",
      )
      .eq("account_id", accountId)
      .order("effective_on", { ascending: true }),
  ])

  return {
    agreements: (agreements.data ?? []).map((row) => ({
      id: row.id,
      dealId: row.deal_id,
      kind: row.kind,
      amountCents: row.amount_gross_cents,
      startsOn: row.starts_on,
      anchorDay: row.anchor_day,
      endsOn: row.ends_on_exclusive,
      status: row.status,
      version: row.version,
    })),
    entries: (entries.data ?? []).map((row) => ({
      id: row.id,
      dealId: row.deal_id,
      entryType: row.entry_type,
      cycleIndex: row.cycle_index,
      effectiveOn: row.effective_on,
      amountCents: row.amount_signed_cents,
      reason: row.reason,
      createdAt: row.created_at,
      supersededAt: row.superseded_at,
      reversesEntryId: row.reverses_entry_id,
    })),
    error: agreements.error || entries.error ? readError : null,
  }
}
