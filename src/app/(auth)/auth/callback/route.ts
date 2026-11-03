import { NextResponse, type NextRequest } from "next/server"

import { safeInternalPath } from "@/lib/auth/return-to"
import { createClient } from "@/lib/supabase/server"
import { getAppOrigin, getPublicSupabaseEnv } from "@/lib/supabase/env"

function redirectTarget(request: NextRequest, path: string) {
  const origin = getAppOrigin() ?? request.nextUrl.origin
  return NextResponse.redirect(new URL(path, origin))
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"), "/reset-password")

  if (!getPublicSupabaseEnv() || (!code && !tokenHash)) {
    return redirectTarget(request, "/login?error=config")
  }

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return redirectTarget(request, "/login?error=auth")
    }
    return redirectTarget(request, next)
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "recovery" | "invite" | "magiclink" | "email",
    })
    if (error) {
      return redirectTarget(request, "/login?error=auth")
    }
    return redirectTarget(request, next)
  }

  return redirectTarget(request, "/login?error=config")
}
