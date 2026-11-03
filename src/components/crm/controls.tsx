"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { CrmFormState } from "@/lib/crm/validation"

export function FormFeedback({ state }: { state: CrmFormState }) {
  const router = useRouter()

  useEffect(() => {
    if (!state.savedAt) {
      return
    }

    const open = state.links?.[0]
    toast.success(state.notice ?? "Zapisano.", {
      action: open
        ? { label: open.label, onClick: () => router.push(open.href) }
        : undefined,
    })
  }, [router, state.links, state.notice, state.savedAt])

  if (state.links?.length) {
    return (
      <div className="flex flex-wrap gap-2">
        {state.links.map((link) => (
          <Button
            key={link.label}
            variant="outline"
            nativeButton={false}
            render={<Link href={link.href} />}
          >
            {link.label}
          </Button>
        ))}
      </div>
    )
  }

  if (!state.error) {
    return null
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>{state.duplicate ? "Możliwy duplikat" : "Nie zapisano"}</AlertTitle>
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  )
}
