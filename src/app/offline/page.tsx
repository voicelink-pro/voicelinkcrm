import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Brak połączenia",
}

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">Brak połączenia</h1>
      <p className="text-sm text-muted-foreground">
        VoiceLink nie pokazuje danych CRM bez sieci i nie zapisuje ich na tym urządzeniu. Wróć, gdy
        połączenie wróci.
      </p>
    </main>
  )
}
