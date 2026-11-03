import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/lib/supabase/database.types"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

export async function createClient() {
  const env = getPublicSupabaseEnv()

  if (!env) {
    throw new Error("Brak publicznej konfiguracji Supabase.")
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components nie mogą zapisać ciasteczek. Odświeżenie sesji
          // wykonuje src/proxy.ts.
        }
      },
    },
  })
}
