"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { deleteDocumentAction } from "@/lib/crm/document-actions"

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
        Usuń
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Usunięcie kasuje plik z prywatnego magazynu. Dopóki magazyn nie potwierdzi, dokument zostaje
        w stanie usuwania i można ponowić.
      </p>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            setPending(true)
            void deleteDocumentAction(documentId).then((result) => {
              setPending(false)
              if ("message" in result && result.message) {
                setMessage(result.message)
                return
              }
              router.push("/documents")
              router.refresh()
            })
          }}
        >
          {pending ? "Usuwam" : message ? "Ponów usuwanie" : "Potwierdź usunięcie"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
          Anuluj
        </Button>
      </div>
    </div>
  )
}
