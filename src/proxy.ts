import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { safeInternalPath } from "@/lib/auth/return-to"
import { getPublicSupabaseEnv } from "@/lib/supabase/env"

const PRIVATE_CACHE = "private, no-cache, no-store, must-revalidate, max-age=0"

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/integrations/n8n/") ||
    pathname.startsWith("/api/integrations/fathom/") ||
    pathname.startsWith("/api/worker/") ||
    pathname === "/offline" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest"
  )
}

function withPrivateCache(response: NextResponse) {
  response.headers.set("Cache-Control", PRIVATE_CACHE)
  response.headers.set("CDN-Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}

function redirectToLogin(request: NextRequest, supabaseResponse?: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  url.searchParams.set(
    "returnTo",
    safeInternalPath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
  )

  const redirectResponse = NextResponse.redirect(url)

  supabaseResponse?.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie)
  })

  if (supabaseResponse) {
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header)
      if (value) {
        redirectResponse.headers.set(header, value)
      }
    }
  }

  return withPrivateCache(redirectResponse)
}

export async function proxy(request: NextRequest) {
  const env = getPublicSupabaseEnv()

  if (!env) {
    if (isPublicPath(request.nextUrl.pathname)) {
      return withPrivateCache(NextResponse.next({ request }))
    }

    return redirectToLogin(request)
  }

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value)
        })
      },
    },
  })

  const { data } = await supabase.auth.getClaims()

  if (!data?.claims && !isPublicPath(request.nextUrl.pathname)) {
    return redirectToLogin(request, supabaseResponse)
  }

  return withPrivateCache(supabaseResponse)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
