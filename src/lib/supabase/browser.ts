import { createBrowserClient } from "@supabase/ssr"

import { getPublicSupabaseEnv } from "@/lib/supabase/env"
import type { Database } from "@/lib/supabase/database.types"

export function createClient() {
  const env = getPublicSupabaseEnv()

  if (!env) {
    throw new Error("Brak publicznej konfiguracji Supabase.")
  }

  return createBrowserClient<Database>(env.url, env.publishableKey)
}
