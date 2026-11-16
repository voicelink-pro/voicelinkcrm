import "server-only"

import { safeInternalPath } from "@/lib/auth/return-to"
import { createAdminClient } from "@/lib/supabase/admin"
import { deliverPush, outboundPushConfigured } from "@/lib/worker/push"

export async function notifyWorkspaceAboutLead(input: {
  workspaceId: string
  eventKey: string
  kind: "lead_imported" | "lead_review" | "lead_manual"
  title: string
  body: string
  targetPath: string
  excludeUserId?: string
}) {
  try {
    const admin = createAdminClient()

    const { data: members, error: membersError } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", input.workspaceId)
      .eq("active", true)

    if (membersError || !members?.length) {
      return
    }

    const recipients = Array.from(
      new Set(
        members
          .map((member) => member.user_id)
          .filter((userId) => userId && userId !== input.excludeUserId),
      ),
    )

    if (recipients.length === 0) {
      return
    }

    const safeTarget = safeInternalPath(input.targetPath, "/leads")
    const title = input.title.trim().slice(0, 120) || "Nowy lead w VoiceLink"
    const body = input.body.trim().slice(0, 240) || null

    const { data: inserted, error: insertError } = await admin
      .from("notifications")
      .upsert(
        recipients.map((userId) => ({
          workspace_id: input.workspaceId,
          recipient_user_id: userId,
          kind: input.kind,
          title,
          body,
          target_path: safeTarget,
          event_key: input.eventKey,
        })),
        {
          onConflict: "recipient_user_id,event_key",
          ignoreDuplicates: true,
        },
      )
      .select("id, recipient_user_id, title, body, target_path")

    if (insertError || !inserted?.length) {
      return
    }

    const insertedRecipients = inserted.map((notice) => notice.recipient_user_id)
    const { data: subscriptions, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_secret, active")
      .eq("workspace_id", input.workspaceId)
      .eq("active", true)
      .in("user_id", insertedRecipients)

    if (subsError || !subscriptions?.length) {
      return
    }

    const deliveries = inserted.flatMap((notice) =>
      subscriptions
        .filter((sub) => sub.user_id === notice.recipient_user_id)
        .map((sub) => ({ notice, sub })),
    )

    if (deliveries.length === 0) {
      return
    }

    await admin
      .schema("private")
      .from("push_deliveries" as never)
      .upsert(
        deliveries.map(({ notice, sub }) => ({
          notification_id: notice.id,
          subscription_id: sub.id,
          status: "pending",
        })) as never,
        {
          onConflict: "notification_id,subscription_id",
          ignoreDuplicates: true,
        },
      )

    const pushReady = outboundPushConfigured()

    await Promise.allSettled(
      deliveries.map(async ({ notice, sub }) => {
        if (!pushReady) {
          await admin.schema("private").rpc("note_push_result" as never, {
            p_notification_id: notice.id,
            p_subscription_id: sub.id,
            p_status: "failed",
            p_code: null,
            p_error: "vapid_absent",
          } as never)
          return
        }

        const attempt = await deliverPush({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          authSecret: sub.auth_secret,
          title: notice.title,
          body: notice.body ?? "",
          targetPath: notice.target_path,
        })

        await admin.schema("private").rpc("note_push_result" as never, {
          p_notification_id: notice.id,
          p_subscription_id: sub.id,
          p_status: attempt.ok ? "sent" : attempt.gone ? "gone" : "failed",
          p_code: attempt.code,
          p_error: attempt.error,
        } as never)

        if (!attempt.ok && !attempt.gone) {
          await admin
            .schema("private")
            .from("job_queue" as never)
            .upsert(
              {
                workspace_id: input.workspaceId,
                job_type: "push_send",
                payload: {
                  notification_id: notice.id,
                  subscription_id: sub.id,
                },
                dedupe_key: `push:${notice.id}:${sub.id}`,
              } as never,
              {
                onConflict: "dedupe_key",
                ignoreDuplicates: true,
              },
            )
        }
      }),
    )
  } catch {
    // Błąd powiadomienia push nie może cofnąć ani zablokować zapisu leada.
  }
}
