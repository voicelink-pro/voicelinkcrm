import "server-only"

import { z } from "zod"

import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"
import { createAdminClient } from "@/lib/supabase/admin"
import { outboundPushConfigured } from "@/lib/worker/push"

const statusSchema = z.object({
  last_finished_at: z.string().nullable(),
  status: z.string().nullable(),
  fresh: z.boolean(),
  dead_jobs: z.number(),
})

export type WorkerStatus = {
  lastFinishedAt: string | null
  status: string | null
  fresh: boolean
  deadJobs: number
  secretConfigured: boolean
  jobsEnabled: boolean
  pushConfigured: boolean
}

const empty: WorkerStatus = {
  lastFinishedAt: null,
  status: null,
  fresh: false,
  deadJobs: 0,
  secretConfigured: false,
  jobsEnabled: false,
  pushConfigured: false,
}

export async function loadWorkerStatus(): Promise<WorkerStatus> {
  const flags = {
    secretConfigured: Boolean(process.env.JOB_WORKER_SECRET),
    jobsEnabled: process.env.ENABLE_BACKGROUND_JOBS === "true" && previewSideEffectsAllowed(),
    pushConfigured: outboundPushConfigured(),
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.schema("private").rpc("worker_status" as never)
    const parsed = statusSchema.safeParse(data)
    if (error || !parsed.success) {
      return { ...empty, ...flags }
    }
    return {
      ...flags,
      lastFinishedAt: parsed.data.last_finished_at,
      status: parsed.data.status,
      fresh: parsed.data.fresh,
      deadJobs: parsed.data.dead_jobs,
    }
  } catch {
    return { ...empty, ...flags }
  }
}
