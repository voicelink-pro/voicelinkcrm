"use client"

import { useActionState, type ReactNode } from "react"
import Link from "next/link"

import { PushDeviceCard } from "@/components/crm/push-device-card"
import { Button } from "@/components/ui/button"
import { safeInternalPath } from "@/lib/auth/return-to"
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  requeueDeadJobsAction,
  setMorningDigestAction,
  type NoticeState,
} from "@/lib/crm/notification-actions"
import { morningDigestPath } from "@/lib/crm/notification-path"
import type { DigestPreference, NotificationRow } from "@/lib/crm/notification-read"

const empty: NoticeState = { message: null, error: null }

function NoticeForm({
  action,
  label,
  children,
}: {
  action: (previous: NoticeState, formData: FormData) => Promise<NoticeState>
  label: string
  children?: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, empty)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {children}
      <Button type="submit" disabled={pending} variant="outline">
        {label}
      </Button>
      {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      {state.message ? <span className="text-sm text-muted-foreground">{state.message}</span> : null}
    </form>
  )
}

export function NotificationCenter({
  rows,
  preference,
  publicKey,
  outboundReady,
  deadJobs,
}: {
  rows: NotificationRow[]
  preference: DigestPreference
  publicKey: string
  outboundReady: boolean
  deadJobs: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <PushDeviceCard publicKey={publicKey} outboundReady={outboundReady} />

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Poranny digest zadań</h2>
        <p className="text-sm text-muted-foreground">
          Codziennie o 08:00 czasu Europe/Warsaw, także w weekend, powstaje jedno podsumowanie
          zadań na dziś ({morningDigestPath}). Puste zestawienie nie tworzy powiadomienia.
        </p>
        <NoticeForm action={setMorningDigestAction} label="Zapisz digest">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={preference.morningDigestEnabled}
              className="size-4"
            />
            Poranne podsumowanie o 08:00
          </label>
        </NoticeForm>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Historia powiadomień</h2>
          <NoticeForm action={markAllNotificationsReadAction} label="Oznacz wszystkie jako przeczytane" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak powiadomień.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const href = safeInternalPath(row.targetPath, "/notifications")
              return (
                <li key={row.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.title}</p>
                      {row.body ? <p className="text-sm text-muted-foreground">{row.body}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        {row.readAt ? "Przeczytane" : "Nieprzeczytane"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button nativeButton={false} variant="outline" render={<Link href={href} />}>
                        Otwórz
                      </Button>
                      {row.readAt ? null : (
                        <NoticeForm action={markNotificationReadAction} label="Przeczytane">
                          <input type="hidden" name="id" value={row.id} />
                        </NoticeForm>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Błędne prace w kolejce</h2>
        <p className="text-sm text-muted-foreground">
          Martwych prac w kolejce: {deadJobs}. Wznowienie wraca do tej samej pracy i nie tworzy
          drugiej pozycji biznesowej.
        </p>
        <NoticeForm action={requeueDeadJobsAction} label="Wznów błędne prace" />
      </section>
    </div>
  )
}
