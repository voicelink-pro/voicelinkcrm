"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function HeaderSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById("app-header-actions"))
  }, [])

  if (target) {
    return createPortal(children, target)
  }

  return <>{children}</>
}
