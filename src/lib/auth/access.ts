import "server-only"

import { z } from "zod"

import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth/session"
import { createCorrelationId } from "@/lib/observability/correlation"
import { createClient } from "@/lib/supabase/server"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

const membershipRowsSchema = z.array(
  z.object({
    workspace_id: z.string().uuid(),
  }),
)

export type WorkspaceGate =
  | { kind: "unconfigured" }
  | { kind: "unauthenticated" }
  | { kind: "schema-missing"; email: string }
  | { kind: "unavailable"; email: string; correlationId: string }
  | { kind: "denied"; email: string }
  | { kind: "member"; email: string; userId: string; workspaceId: string }

function isMissingRelation(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST204"
}

export async function getWorkspaceGate(): Promise<WorkspaceGate> {
  if (!getPublicSupabaseEnv()) {
    return { kind: "unconfigured" }
  }

  const user = await getAuthenticatedUser()

  if (!user) {
    return { kind: "unauthenticated" }
  }

  return readMembership(user)
}

async function readMembership(user: AuthenticatedUser): Promise<WorkspaceGate> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)

  if (error) {
    if (isMissingRelation(error.code)) {
      return { kind: "schema-missing", email: user.email }
    }

    const correlationId = createCorrelationId()
    console.error(
      JSON.stringify({
        scope: "membership",
        correlationId,
        code: error.code ?? "unknown",
      }),
    )

    return { kind: "unavailable", email: user.email, correlationId }
  }

  const parsed = membershipRowsSchema.safeParse(data)

  if (!parsed.success || parsed.data.length === 0) {
    return { kind: "denied", email: user.email }
  }

  return {
    kind: "member",
    email: user.email,
    userId: user.id,
    workspaceId: parsed.data[0].workspace_id,
  }
}
