"use client"

import { useActionState } from "react"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cleanupStaleDocumentsAction } from "@/lib/crm/document-actions"

export function DocumentCleanup() {
  const [state, action, pending] = useActionState(cleanupStaleDocumentsAction, {
    removed: 0,
    message: null as string | null,
  })

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {state.message ? <span className="text-xs text-destructive">{state.message}</span> : null}
      {state.removed > 0 ? (
        <span className="text-xs text-muted-foreground">
          Usunięto niedokończone pliki: {state.removed}
        </span>
      ) : null}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="Usuwa niedokończone wysyłki starsze niż 24 godziny z magazynu i listy"
        className="text-muted-foreground hover:text-foreground"
      >
        <SparklesIcon data-icon="inline-start" />
        {pending ? "Porządkuję..." : "Porządkuj niedokończone"}
      </Button>
    </form>
  )
}
