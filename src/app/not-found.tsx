import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/shell/wordmark"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-4 bg-background px-6">
      <Wordmark />
      <h1 className="text-2xl font-semibold">Nie znaleziono strony</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ten adres nie prowadzi do ekranu CRM.
      </p>
      <Button nativeButton={false} render={<Link href="/" />}>
        Wróć na start
      </Button>
    </main>
  )
}
