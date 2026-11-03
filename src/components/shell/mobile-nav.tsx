"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { EllipsisIcon } from "lucide-react"

import { isNavActive, mobileNav } from "@/lib/navigation"
import { cn } from "cn"
import { useSidebar } from "@/components/ui/sidebar"

export function MobileNav() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  return (
    <nav
      aria-label="Nawigacja mobilna"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {mobileNav.map((item) => {
          const active = isNavActive(pathname, item.href)

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 px-2 py-2 text-xs focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon aria-hidden="true" className="size-4" />
                <span>{item.href === "/" ? "Start" : item.label}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className="flex min-h-11 w-full flex-col items-center justify-center gap-1 px-2 py-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpenMobile(true)}
          >
            <EllipsisIcon aria-hidden="true" className="size-4" />
            <span>Więcej</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
