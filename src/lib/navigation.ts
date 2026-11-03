import {
  Building2Icon,
  CalendarIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ReceiptTextIcon,
  RocketIcon,
  SettingsIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: string
}

export type NavSection = {
  label: string
  items: NavItem[]
}

export const dashboardNav: NavItem = {
  href: "/",
  label: "Dashboard",
  icon: LayoutDashboardIcon,
}

export const navSections: NavSection[] = [
  {
    label: "Sprzedaż",
    items: [
      { href: "/leads", label: "Leady", icon: UsersIcon },
      { href: "/clients", label: "Klienci", icon: Building2Icon },
      { href: "/deployments", label: "Wdrożenia", icon: RocketIcon },
      { href: "/meetings", label: "Spotkania", icon: VideoIcon },
    ],
  },
  {
    label: "Firma",
    items: [
      { href: "/documents", label: "Dokumenty", icon: FileTextIcon },
      { href: "/invoices", label: "Faktury", icon: ReceiptTextIcon },
    ],
  },
  {
    label: "Organizacja",
    items: [
      { href: "/tasks", label: "Zadania", icon: ListChecksIcon },
      { href: "/calendar", label: "Kalendarz", icon: CalendarIcon },
    ],
  },
]

export const mainNav: NavItem[] = [
  dashboardNav,
  ...navSections.flatMap((section) => section.items),
]

export const mobileNav: NavItem[] = [
  dashboardNav,
  navSections[0]!.items[0]!, // Leady
  navSections[2]!.items[0]!, // Zadania
]

export const settingsNav: NavItem = {
  href: "/settings",
  label: "Ustawienia",
  icon: SettingsIcon,
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function screenTitle(pathname: string) {
  if (pathname.startsWith("/accounts/")) {
    return "Karta klienta"
  }

  if (pathname.startsWith("/leads/")) {
    return "Karta leada"
  }

  if (isNavActive(pathname, settingsNav.href)) {
    return settingsNav.label
  }

  const match = mainNav.find((item) => isNavActive(pathname, item.href))

  return match?.label ?? "VoiceLink"
}
