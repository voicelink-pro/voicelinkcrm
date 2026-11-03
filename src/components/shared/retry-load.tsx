"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export function RetryLoad() {
  const router = useRouter()

  return (
    <Button type="button" variant="outline" className="mt-2" onClick={() => router.refresh()}>
      Ponów
    </Button>
  )
}
