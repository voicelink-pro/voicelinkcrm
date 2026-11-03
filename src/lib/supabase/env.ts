export type PublicSupabaseEnv = {
  url: string
  publishableKey: string
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    return null
  }

  return { url, publishableKey }
}

export function getAppOrigin(): string | null {
  const appUrl = process.env.APP_URL

  if (!appUrl) {
    return null
  }

  return appUrl.replace(/\/$/, "")
}
