"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export default function CrmError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Nie udało się wczytać ekranu</AlertTitle>
      <AlertDescription>
        Dane nie zostały potwierdzone. Możesz spróbować ponownie.
      </AlertDescription>
      <Button type="button" variant="outline" onClick={reset}>
        Ponów
      </Button>
    </Alert>
  )
}
