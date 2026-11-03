import "server-only"

import { z } from "zod"

import { syncCalendarSourceById } from "@/lib/crm/calendar-sync"
import { saveFathomCursor, getFathomConnection } from "@/lib/integrations/fathom/store"
import { syncFathomConnection } from "@/lib/integrations/fathom/sync"
import { createAdminClient } from "@/lib/supabase/admin"
import { deliverPush } from "@/lib/worker/push"

const jobSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid().nullable(),
  job_type: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
})

type WorkerJob = z.infer<typeof jobSchema>

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema("private").rpc(name as never, args as never)
  if (error) {
    throw new Error(error.code ?? "rpc_failed")
  }
  return data as T
}

async function finish(jobId: string, ok: boolean, error: string | null) {
  await rpc("finish_worker_job", {
    p_job_id: jobId,
    p_ok: ok,
    p_error: error,
  })
}

async function pollMinutes(workspaceId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from("automation_settings")
    .select("fathom_poll_interval_minutes")
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  return data?.fathom_poll_interval_minutes ?? 15
}

async function handleFathom(job: WorkerJob) {
  const connectionId = job.payload?.connection_id
  if (typeof connectionId !== "string" || !job.workspace_id) {
    return finish(job.id, false, "invalid_payload")
  }

  const connection = await getFathomConnection(connectionId)
  if (!connection || !connection.enabled || connection.status !== "active") {
    return finish(job.id, true, null)
  }

  if (!connection.ownerUserId) {
    return finish(job.id, false, "missing_owner")
  }

  const result = await syncFathomConnection({
    actorId: connection.ownerUserId,
    connection,
    pollMinutes: await pollMinutes(job.workspace_id),
  })

  if (result.message.startsWith("Klucz API")) {
    await saveFathomCursor(connection.ownerUserId, connection.id, connection.cursor, false, "missing_api_key")
    return finish(job.id, true, null)
  }

  if (result.message.startsWith("Zapisano")) {
    return finish(job.id, true, null)
  }

  return finish(job.id, false, "fathom_sync")
}

async function handlePush(job: WorkerJob) {
  const notificationId = job.payload?.notification_id
  const subscriptionId = job.payload?.subscription_id
  if (typeof notificationId !== "string" || typeof subscriptionId !== "string") {
    return finish(job.id, false, "invalid_payload")
  }

  const admin = createAdminClient()
  const [{ data: notice }, { data: subscription }] = await Promise.all([
    admin
      .from("notifications")
      .select("id, recipient_user_id, title, body, target_path")
      .eq("id", notificationId)
      .maybeSingle(),
    admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_secret, active")
      .eq("id", subscriptionId)
      .maybeSingle(),
  ])

  if (!notice || !subscription) {
    return finish(job.id, true, null)
  }

  if (!subscription.active || subscription.user_id !== notice.recipient_user_id) {
    await rpc("note_push_result", {
      p_notification_id: notificationId,
      p_subscription_id: subscriptionId,
      p_status: "gone",
      p_code: 410,
      p_error: "inactive",
    })
    return finish(job.id, true, null)
  }

  const attempt = await deliverPush({
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    authSecret: subscription.auth_secret,
    title: notice.title,
    body: notice.body ?? "",
    targetPath: notice.target_path,
  })

  if (attempt.ok) {
    await rpc("note_push_result", {
      p_notification_id: notificationId,
      p_subscription_id: subscriptionId,
      p_status: "sent",
      p_code: attempt.code,
      p_error: null,
    })
    return finish(job.id, true, null)
  }

  await rpc("note_push_result", {
    p_notification_id: notificationId,
    p_subscription_id: subscriptionId,
    p_status: attempt.gone ? "gone" : "failed",
    p_code: attempt.code,
    p_error: attempt.error,
  })

  if (attempt.gone) {
    return finish(job.id, true, null)
  }

  return finish(job.id, false, attempt.error)
}

async function handle(job: WorkerJob) {
  if (job.job_type === "morning_digest") {
    await rpc("build_morning_digest", { p_job_id: job.id, p_at: new Date().toISOString() })
    return finish(job.id, true, null)
  }

  if (job.job_type === "revenue_catch_up") {
    const accountId = job.payload?.account_id
    if (typeof accountId !== "string") {
      return finish(job.id, false, "invalid_payload")
    }
    await rpc("catch_up_account_worker", { p_account_id: accountId })
    return finish(job.id, true, null)
  }

  if (job.job_type === "fathom_poll") {
    return handleFathom(job)
  }

  if (job.job_type === "calendar_sync") {
    const sourceId = job.payload?.source_id
    if (typeof sourceId !== "string") {
      return finish(job.id, false, "invalid_payload")
    }
    const res = await syncCalendarSourceById(sourceId)
    return finish(job.id, res.ok, res.ok ? null : "calendar_sync_failed")
  }

  if (job.job_type === "push_send") {
    return handlePush(job)
  }

  return finish(job.id, false, "unknown_job")
}

export async function runWorkerTick() {
  const tickId = await rpc<string>("start_worker_tick", {})
  let claimed = 0
  let failed = 0

  try {
    await rpc("enqueue_worker_jobs", { p_at: new Date().toISOString() })

    for (let round = 0; round < 3; round += 1) {
      const claimedRows = await rpc<unknown[]>("claim_worker_jobs", {
        p_limit: 10,
        p_lease_seconds: 120,
      })
      const jobs = z.array(jobSchema).parse(claimedRows ?? [])
      if (jobs.length === 0) {
        break
      }

      for (const job of jobs) {
        claimed += 1
        try {
          await handle(job)
        } catch {
          failed += 1
          await finish(job.id, false, "handler_failed")
        }
      }
    }

    await rpc("finish_worker_tick", {
      p_tick_id: tickId,
      p_status: "ok",
      p_claimed: claimed,
      p_detail: failed > 0 ? `failed:${failed}` : null,
    })

    return { claimed, failed }
  } catch {
    await rpc("finish_worker_tick", {
      p_tick_id: tickId,
      p_status: "error",
      p_claimed: claimed,
      p_detail: "tick_failed",
    }).catch(() => undefined)
    throw new Error("tick_failed")
  }
}
