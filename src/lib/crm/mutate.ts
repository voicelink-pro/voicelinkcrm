import "server-only"

import { getWorkspaceGate } from "@/lib/auth/access"
import { polishDatabaseError } from "@/lib/database/errors"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"

type RpcName = keyof Database["private"]["Functions"]

export async function callCrm<T>(name: RpcName, args: Record<string, unknown>) {
  const gate = await getWorkspaceGate()

  if (gate.kind !== "member") {
    return {
      gate,
      data: null as T | null,
      message: "Brak dostępu do tego obszaru roboczego.",
    }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema("private")
      .rpc(name, args as never)

    if (error) {
      return { gate, data: null as T | null, message: polishDatabaseError(error) }
    }

    return { gate, data: data as T, message: null }
  } catch {
    return {
      gate,
      data: null as T | null,
      message: "Nie udało się zapisać zmiany.",
    }
  }
}
