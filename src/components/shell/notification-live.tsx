"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/browser"

export function NotificationLive({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer = 0
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => router.refresh(), 400)
        },
      )
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [router, userId])

  return null
}
