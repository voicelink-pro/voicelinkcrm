"use client"

import { useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  )
}

export function SearchDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-w-11 justify-start text-muted-foreground"
        aria-label="Szukaj"
        onClick={() => setOpen(true)}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="sr-only md:not-sr-only">Szukaj</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wyszukiwanie</DialogTitle>
            <DialogDescription>
              Szuka w nazwach firm, kontaktów, szans, wdrożeń, zadań i dokumentów. Nie przeszukuje treści transkrypcji.
            </DialogDescription>
          </DialogHeader>
          <form action="/search" method="get" className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Fraza
              <input name="q" autoFocus className="h-11 rounded-lg border border-input bg-transparent px-2.5" />
            </label>
            <Button type="submit">Szukaj</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
