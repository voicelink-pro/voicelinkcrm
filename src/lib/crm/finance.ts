import "server-only"

import { getWorkspaceGate } from "@/lib/auth/access"
import { callCrm } from "@/lib/crm/mutate"
import type { ScheduleRow } from "@/lib/crm/finance-types"
import { createAdminClient } from "@/lib/supabase/admin"

export type { ScheduleRow }

export async function catchUpAccount(accountId: string) {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return
  }

  await callCrm("catch_up_due_revenue", {
    p_actor_user_id: gate.userId,
    p_account_id: accountId,
  })
}

export async function warsawToday() {
  const admin = createAdminClient()
  const { data, error } = await admin.schema("private").rpc("warsaw_today")
  if (error || !data) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date())
  }
  return data
}

export async function previewSchedule(
  startsOn: string,
  anchorDay: number,
  endsOn: string | null,
  today: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || anchorDay < 1 || anchorDay > 31) {
    return []
  }

  const admin = createAdminClient()
  const rows: ScheduleRow[] = []

  for (let index = 0; index < 6; index += 1) {
    const { data, error } = await admin.schema("private").rpc("subscription_cycle_date", {
      p_starts_on: startsOn,
      p_anchor_day: anchorDay,
      p_cycle_index: index,
    })

    if (error || !data) {
      break
    }

    const date = data
    let state: ScheduleRow["state"] = date <= today ? "due" : "future"
    if (endsOn && date >= endsOn) {
      state = "excluded"
    }
    rows.push({ index, date, state })
  }

  return rows
}
