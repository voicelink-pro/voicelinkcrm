"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellIcon, CheckCheck } from "lucide-react"

import { NotificationLive } from "@/components/shell/notification-live"
import { PwaRegister } from "@/components/shell/pwa-register"
import { safeInternalPath } from "@/lib/auth/return-to"
import { formatDateTime } from "@/lib/crm/format"
import { markAllNotificationsReadAction } from "@/lib/crm/notification-actions"
import type { NotificationRow } from "@/lib/crm/notification-read"
import { screenTitle } from "@/lib/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

function initials(email: string) {
  const source = email.trim()

  if (!source) {
    return "?"
  }

  return source.slice(0, 1).toUpperCase()
}

export function AppHeader({
  email,
  userId,
  avatarUrl,
  unreadCount,
  notifications = [],
}: {
  email: string
  userId: string
  avatarUrl?: string | null
  unreadCount: number
  notifications?: NotificationRow[]
}) {
  const pathname = usePathname()
  const title = screenTitle(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cleared, setCleared] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const badgeCount = cleared ? 0 : unreadCount

  useEffect(() => {
    if (!menuOpen) return

    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  function toggleMenu() {
    const nextOpen = !menuOpen
    setMenuOpen(nextOpen)
    if (nextOpen && badgeCount > 0) {
      setCleared(true)
      void markAllNotificationsReadAction()
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:px-4">
      <SidebarTrigger className="size-7" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate text-sm font-medium">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-1.5">
        <div id="app-header-actions" className="flex items-center gap-1.5" />

        <div ref={menuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="relative"
            aria-label={
              badgeCount > 0
                ? `Powiadomienia, nieprzeczytane ${badgeCount}`
                : "Powiadomienia"
            }
          >
            <BellIcon className="size-4" />
            {badgeCount > 0 ? (
              <span className="absolute top-0.5 right-0.5 min-w-3.5 rounded-full bg-primary px-1 text-[9px] leading-3.5 font-semibold text-primary-foreground">
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            ) : null}
          </Button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="Ostatnie powiadomienia"
              className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 sm:w-88"
            >
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-foreground">
                  Ostatnie powiadomienia
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <CheckCheck className="size-3.5" />
                  Przeczytane
                </span>
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                  <BellIcon className="size-5 text-muted-foreground/60" />
                  <p className="text-xs font-medium text-foreground">
                    Brak powiadomień
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Nowe powiadomienia pojawią się w tym miejscu.
                  </p>
                </div>
              ) : (
                <div className="flex max-h-80 flex-col divide-y divide-border/60 overflow-y-auto">
                  {notifications.map((item) => {
                    const href = safeInternalPath(item.targetPath, "/")
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex flex-col gap-1 px-3.5 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {item.title}
                          </span>
                        </div>
                        {item.body ? (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {item.body}
                          </p>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground/80">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pl-0.5">
          <Avatar className="size-6">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={email} className="object-cover" />
            ) : null}
            <AvatarFallback className="text-[11px]">{initials(email)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-xs text-muted-foreground md:inline">
            {email}
          </span>
        </div>
        <PwaRegister />
        <NotificationLive userId={userId} />
      </div>
    </header>
  )
}
