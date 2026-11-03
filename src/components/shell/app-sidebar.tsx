"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOutIcon } from "lucide-react"

import { logoutAction } from "@/lib/auth/actions"
import {
  dashboardNav,
  isNavActive,
  navSections,
  settingsNav,
} from "@/lib/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  const dashboardActive = isNavActive(pathname, dashboardNav.href)

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 py-5">
        <Link
          href="/"
          aria-label="VoiceLink"
          className="inline-flex items-center rounded-md focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Image
            src="/icons/logo-white.png"
            alt="VoiceLink"
            width={160}
            height={36}
            priority
            className="h-7 w-auto object-contain"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="pb-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href={dashboardNav.href} />}
                  isActive={dashboardActive}
                  aria-current={dashboardActive ? "page" : undefined}
                >
                  <dashboardNav.icon />
                  <span>{dashboardNav.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navSections.map((section) => (
          <SidebarGroup key={section.label} className="py-1.5">
            <SidebarGroupLabel className="px-2.5 text-[11px] font-semibold tracking-wider text-sidebar-foreground/55 uppercase">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href)

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/75">
                          {item.badge}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-3 p-3">
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={settingsNav.href} />}
              isActive={isNavActive(pathname, settingsNav.href)}
            >
              <settingsNav.icon />
              <span>{settingsNav.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logoutAction}>
              <SidebarMenuButton type="submit">
                <LogOutIcon />
                <span>Wyloguj</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
