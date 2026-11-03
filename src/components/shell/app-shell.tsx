"use client"

import type { CSSProperties, ReactNode } from "react"

import { AppHeader } from "@/components/shell/app-header"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { MobileNav } from "@/components/shell/mobile-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { NotificationRow } from "@/lib/crm/notification-read"

export function AppShell({
  email,
  userId,
  avatarUrl,
  unreadCount,
  notifications = [],
  children,
}: {
  email: string
  userId: string
  avatarUrl?: string | null
  unreadCount: number
  notifications?: NotificationRow[]
  children: ReactNode
}) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <AppHeader
          email={email}
          userId={userId}
          avatarUrl={avatarUrl}
          unreadCount={unreadCount}
          notifications={notifications}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-4 md:p-8 [&>*]:min-w-0">
          {children}
        </div>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  )
}
