"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { applyFieldSnapshot, snapshotFields, type FieldSnapshot } from "@/lib/crm/form-values"

export function ActionForm({
  action,
  pending,
  failed,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  pending: boolean
  failed: boolean
  className?: string
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const snapshot = useRef<FieldSnapshot>([])
  const wasPending = useRef(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (wasPending.current && !pending && failed) {
      const form = formRef.current
      if (form) {
        applyFieldSnapshot(form, snapshot.current)
      }
    }
    wasPending.current = pending
  }, [failed, pending])

  return (
    <form
      ref={formRef}
      className={className}
      action={(formData) => {
        const entries = snapshotFields(formData)
        snapshot.current = entries
        if (!navigator.onLine) {
          setOffline(true)
          window.setTimeout(() => {
            const form = formRef.current
            if (form) applyFieldSnapshot(form, entries)
          }, 0)
          return
        }
        setOffline(false)
        void action(formData)
      }}
      onSubmit={(event) => {
        if (!navigator.onLine) {
          event.preventDefault()
          setOffline(true)
          snapshot.current = snapshotFields(new FormData(event.currentTarget))
          return
        }
        setOffline(false)
        snapshot.current = snapshotFields(new FormData(event.currentTarget))
      }}
      onReset={(event) => {
        if (snapshot.current.length > 0) {
          event.preventDefault()
        }
      }}
    >
      {offline ? (
        <p className="text-sm text-destructive" role="alert">
          Brak połączenia. Zapis nie został wykonany.
        </p>
      ) : null}
      {children}
    </form>
  )
}
