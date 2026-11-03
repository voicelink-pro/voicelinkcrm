"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/browser"

const tables = [
  "accounts",
  "contacts",
  "deals",
  "deal_stage_history",
  "activities",
  "notes",
  "tasks",
  "task_assignees",
  "billing_agreements",
  "revenue_entries",
  "deployments",
  "deployment_checklist_items",
  "deployment_status_history",
  "documents",
  "document_links",
  "meeting_records",
  "meeting_links",
  "meeting_transcript_segments",
] as const

export function LiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let timer = 0
    const channel = supabase.channel("crm-records")

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => router.refresh(), 400)
        },
      )
    }

    channel.subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
