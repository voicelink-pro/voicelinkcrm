import "server-only"

import { getWorkspaceGate } from "@/lib/auth/access"
import { callCrm } from "@/lib/crm/mutate"

export async function suggestFollowUpDue() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return null
  }

  const suggested = await callCrm<string | null>("resolve_follow_up_due_on", {
    p_workspace_id: gate.workspaceId,
    p_at: null,
  })

  if (suggested.message || !suggested.data) {
    return null
  }

  return suggested.data
}
