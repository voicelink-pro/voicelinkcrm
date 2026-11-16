import type { Metadata } from "next"

import { NotificationCenter } from "@/components/crm/notification-center"
import { getWorkspaceGate } from "@/lib/auth/access"
import { listNotifications, loadDigestPreference } from "@/lib/crm/notification-read"
import { outboundPushConfigured, publicVapidKey } from "@/lib/worker/push"
import { loadWorkerStatus } from "@/lib/worker/status"

export const metadata: Metadata = {
  title: "Powiadomienia",
}

export default async function NotificationsPage() {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return null
  }

  const [{ rows }, preference, worker] = await Promise.all([
    listNotifications(),
    loadDigestPreference(),
    loadWorkerStatus(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Powiadomienia</h1>
        <p className="text-sm text-muted-foreground">
          Powiadomienia o nowych leadach, subskrypcja Web Push na telefonie (iOS / Android) oraz
          poranne podsumowanie zadań.
        </p>
      </div>

      <NotificationCenter
        rows={rows}
        preference={preference}
        publicKey={publicVapidKey()}
        outboundReady={outboundPushConfigured()}
        deadJobs={worker.deadJobs}
      />
    </div>
  )
}
