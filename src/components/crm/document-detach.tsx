"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export function DocumentDetach({
  documentId,
  linkId,
  detach,
}: {
  documentId: string
  linkId: string
  detach: (documentId: string, linkId: string) => Promise<{ message?: string; ok?: true }>
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void detach(documentId, linkId).then((result) => {
            if (result.message) {
              setMessage(result.message)
              return
            }
            router.refresh()
          })
        }}
      >
        Odepnij
      </Button>
      {message ? <span className="text-sm text-destructive">{message}</span> : null}
    </>
  )
}
