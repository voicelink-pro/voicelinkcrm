"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { safeInternalPath } from "@/lib/auth/return-to"
import { createAdminClient } from "@/lib/supabase/admin"
import { deliverPush, outboundPushConfigured } from "@/lib/worker/push"

export type NoticeState = {
  message: string | null
  error: string | null
}

const empty: NoticeState = { message: null, error: null }

async function member() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return null
  }
  return gate
}

async function rpc(name: string, args: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.schema("private").rpc(name as never, args as never)
  return error
}

function refresh() {
  revalidatePath("/", "layout")
}

export async function markNotificationReadAction(
  _previous: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const gate = await member()
  const id = z.uuid().safeParse(formData.get("id"))
  if (!gate || !id.success) {
    return { ...empty, error: "Nie udało się oznaczyć powiadomienia." }
  }

  const error = await rpc("mark_notifications_read", {
    p_actor_user_id: gate.userId,
    p_notification_id: id.data,
  })
  if (error) {
    return { ...empty, error: "Nie udało się oznaczyć powiadomienia." }
  }

  refresh()
  return { ...empty, message: "Oznaczone jako przeczytane." }
}

export async function markAllNotificationsReadAction(
  previous?: NoticeState,
  formData?: FormData,
): Promise<NoticeState> {
  void previous
  void formData
  const gate = await member()
  if (!gate) {
    return { ...empty, error: "Brak dostępu." }
  }

  const error = await rpc("mark_notifications_read", {
    p_actor_user_id: gate.userId,
    p_notification_id: null,
  })
  if (error) {
    return { ...empty, error: "Nie udało się oznaczyć powiadomień." }
  }

  refresh()
  return { ...empty, message: "Wszystkie oznaczone jako przeczytane." }
}

export async function setMorningDigestAction(
  _previous: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const gate = await member()
  if (!gate) {
    return { ...empty, error: "Brak dostępu." }
  }

  const error = await rpc("set_morning_digest_enabled", {
    p_actor_user_id: gate.userId,
    p_enabled: formData.get("enabled") === "on",
  })
  if (error) {
    return { ...empty, error: "Nie udało się zapisać ustawienia digestu." }
  }

  refresh()
  return { ...empty, message: "Zapisano ustawienie porannego digestu." }
}

export async function requeueDeadJobsAction(
  previous: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  void previous
  void formData
  const gate = await member()
  if (!gate) {
    return { ...empty, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.schema("private").rpc("requeue_dead_jobs", {
    p_actor_user_id: gate.userId,
  })
  if (error) {
    return { ...empty, error: "Nie udało się wznowić błędnych prac." }
  }

  refresh()
  return { ...empty, message: `Wznawiam ${Number(data ?? 0)} błędnych prac.` }
}

const subscriptionSchema = z.object({
  endpoint: z.string().startsWith("https://").max(2000),
  p256dh: z.string().min(1).max(400),
  authSecret: z.string().min(1).max(400),
  installationId: z.string().min(1).max(80),
  deviceLabel: z.string().max(80).optional(),
})

export async function savePushSubscriptionAction(input: unknown): Promise<NoticeState> {
  const gate = await member()
  const parsed = subscriptionSchema.safeParse(input)
  if (!gate || !parsed.success) {
    return { ...empty, error: "Nie udało się zapisać urządzenia." }
  }

  const error = await rpc("save_push_subscription", {
    p_actor_user_id: gate.userId,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth_secret: parsed.data.authSecret,
    p_installation_id: parsed.data.installationId,
    p_device_label: parsed.data.deviceLabel ?? null,
  })
  if (error) {
    return { ...empty, error: "Nie udało się zapisać urządzenia." }
  }

  refresh()
  return { ...empty, message: "Urządzenie jest zapisane." }
}

export async function sendPushTestAction(
  previous: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  void previous
  void formData
  const gate = await member()
  if (!gate) {
    return { ...empty, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const created = await admin.schema("private").rpc("create_push_test", {
    p_actor_user_id: gate.userId,
  })

  if (created.error || !created.data) {
    return { ...empty, error: "Nie udało się zapisać testu w centrum." }
  }

  const subscriptions = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_secret, active")
    .eq("user_id", gate.userId)
    .eq("active", true)

  refresh()

  if (subscriptions.error || !subscriptions.data?.length) {
    return {
      ...empty,
      message: "Zapisano powiadomienie w centrum. To konto nie ma aktywnego urządzenia.",
    }
  }

  if (!outboundPushConfigured()) {
    for (const subscription of subscriptions.data) {
      await rpc("note_push_result", {
        p_notification_id: created.data,
        p_subscription_id: subscription.id,
        p_status: "failed",
        p_code: null,
        p_error: "vapid_absent",
      })
    }
    return {
      ...empty,
      message:
        "Zapisano powiadomienie w centrum. Push nie wyszedł, bo na serwerze nie ma kluczy albo wysyłka jest wyłączona.",
    }
  }

  const notice = await admin
    .from("notifications")
    .select("title, body, target_path, recipient_user_id")
    .eq("id", created.data)
    .maybeSingle()

  if (!notice.data || notice.data.recipient_user_id !== gate.userId) {
    return { ...empty, error: "Test nie został wysłany." }
  }

  let sent = 0
  for (const subscription of subscriptions.data) {
    const attempt = await deliverPush({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      authSecret: subscription.auth_secret,
      title: notice.data.title,
      body: notice.data.body ?? "",
      targetPath: safeInternalPath(notice.data.target_path, "/"),
    })
    await rpc("note_push_result", {
      p_notification_id: created.data,
      p_subscription_id: subscription.id,
      p_status: attempt.ok ? "sent" : attempt.gone ? "gone" : "failed",
      p_code: attempt.code,
      p_error: attempt.error,
    })
    if (attempt.ok) {
      sent += 1
    }
  }

  return {
    ...empty,
    message: `Zapisano powiadomienie w centrum. Wysłane na ${sent} z ${subscriptions.data.length} urządzeń.`,
  }
}
