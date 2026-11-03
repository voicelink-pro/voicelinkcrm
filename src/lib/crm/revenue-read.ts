import "server-only"

import { getWorkspaceGate } from "@/lib/auth/access"
import { revenuePageSize, type RevenueKind } from "@/lib/crm/revenue-query"
import { createAdminClient } from "@/lib/supabase/admin"

export type RevenueListRow = {
  id: string
  entryType: string
  component: string
  effectiveOn: string
  amountSignedCents: number
  dealId: string
  dealTitle: string
  accountId: string
  accountName: string
  reason: string | null
}

export type ActiveSubscriptionRow = {
  id: string
  amountGrossCents: number
  dealId: string
  dealTitle: string
  accountId: string
  accountName: string
  startsOn: string
  endsOnExclusive: string | null
}

export type RevenueList = {
  count: number
  totalCents: number
  rows: RevenueListRow[]
  agreements: ActiveSubscriptionRow[]
}

const readError = "Nie udało się wczytać ewidencji."
const periodError = "Zakres dat jest niepoprawny."

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) {
      return parsed
    }
  }
  return null
}

function text(value: unknown) {
  return typeof value === "string" ? value : null
}

function parseList(value: unknown, kind: RevenueKind): RevenueList | null {
  const payload = record(value)
  const count = payload ? integer(payload.count) : null
  const totalCents = payload ? integer(payload.total_cents) : null
  if (!payload || count == null || totalCents == null || !Array.isArray(payload.rows)) {
    return null
  }

  if (kind === "active") {
    const agreements = payload.rows.flatMap((item) => {
      const row = record(item)
      const id = row ? text(row.id) : null
      const amount = row ? integer(row.amount_gross_cents) : null
      const dealId = row ? text(row.deal_id) : null
      const dealTitle = row ? text(row.deal_title) : null
      const accountId = row ? text(row.account_id) : null
      const accountName = row ? text(row.account_name) : null
      const startsOn = row ? text(row.starts_on)?.slice(0, 10) : null
      if (!id || amount == null || !dealId || !dealTitle || !accountId || !accountName || !startsOn) {
        return []
      }
      return [{
        id,
        amountGrossCents: amount,
        dealId,
        dealTitle,
        accountId,
        accountName,
        startsOn,
        endsOnExclusive: row ? text(row.ends_on_exclusive)?.slice(0, 10) ?? null : null,
      }]
    })
    if (agreements.length !== payload.rows.length) {
      return null
    }
    return { count, totalCents, rows: [], agreements }
  }

  const rows = payload.rows.flatMap((item) => {
    const row = record(item)
    const id = row ? text(row.id) : null
    const entryType = row ? text(row.entry_type) : null
    const component = row ? text(row.component) : null
    const effectiveOn = row ? text(row.effective_on)?.slice(0, 10) : null
    const amount = row ? integer(row.amount_signed_cents) : null
    const dealId = row ? text(row.deal_id) : null
    const dealTitle = row ? text(row.deal_title) : null
    const accountId = row ? text(row.account_id) : null
    const accountName = row ? text(row.account_name) : null
    if (!id || !entryType || !component || !effectiveOn || amount == null || !dealId || !dealTitle || !accountId || !accountName) {
      return []
    }
    return [{
      id,
      entryType,
      component,
      effectiveOn,
      amountSignedCents: amount,
      dealId,
      dealTitle,
      accountId,
      accountName,
      reason: row ? text(row.reason) : null,
    }]
  })
  if (rows.length !== payload.rows.length) {
    return null
  }
  return { count, totalCents, rows, agreements: [] }
}

export async function listPeriodRevenue(
  kind: RevenueKind,
  from: string,
  to: string,
  owner: string,
  page: number,
) {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { list: null as RevenueList | null, message: "Brak dostępu do tego obszaru roboczego." }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.schema("private").rpc("list_period_revenue" as never, {
      p_actor_user_id: gate.userId,
      p_from: kind === "active" ? null : from || null,
      p_to: kind === "active" ? null : to || null,
      p_kind: kind,
      p_owner_user_id: kind === "active" && owner ? owner : null,
      p_limit: revenuePageSize,
      p_offset: (page - 1) * revenuePageSize,
    } as never)

    if (error) {
      const message = error.message ?? ""
      return {
        list: null as RevenueList | null,
        message: message.includes("period_invalid") ? periodError : readError,
      }
    }

    const list = parseList(data, kind)
    if (!list) {
      return { list: null as RevenueList | null, message: readError }
    }
    return { list, message: null }
  } catch {
    return { list: null as RevenueList | null, message: readError }
  }
}
