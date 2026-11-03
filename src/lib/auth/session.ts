import "server-only"

import { createClient } from "@/lib/supabase/server"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

export type AuthenticatedUser = {
  id: string
  email: string
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (!getPublicSupabaseEnv()) {
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims || typeof data.claims.sub !== "string") {
    return null
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : ""

  return {
    id: data.claims.sub,
    email,
  }
}
