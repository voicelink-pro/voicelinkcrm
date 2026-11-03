"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Sheet, SheetContent } from "@/components/ui/sheet"

export function MeetingSheet({
  backHref = "/meetings",
  children,
}: {
  backHref?: string
  children: ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          router.push(backHref, { scroll: false })
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex h-svh w-full flex-col gap-0 overflow-hidden p-0 sm:w-[75vw] sm:max-w-[75vw]"
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}
