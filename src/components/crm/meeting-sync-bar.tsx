"use client"

import { useActionState } from "react"
import { CloudDownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { syncPrimaryFathomAction, type FathomFormState } from "@/lib/integrations/fathom/actions"

const initial: FathomFormState = { message: undefined }

export function MeetingSyncBar() {
  const [state, action, pending] = useActionState(syncPrimaryFathomAction, initial)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.message ? (
        <span className="text-xs text-muted-foreground">{state.message}</span>
      ) : null}
      <form action={action}>
        <input type="hidden" name="fresh" value="1" />
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Pobieranie nagrań...
            </>
          ) : (
            <>
              <CloudDownloadIcon data-icon="inline-start" />
              Pobierz nagrania z Fathom
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
