"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Dialog, DialogContent } from "@/components/ui/dialog"

export function LeadDialog({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) router.back()
      }}
    >
      <DialogContent className="w-[min(28rem,calc(100%-1.5rem))] max-w-none p-0 sm:max-w-none">
        <div className="max-h-[min(85svh,640px)] overflow-y-auto p-4 pe-12">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
