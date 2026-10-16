import {
  BookOpen,
  Bot,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Landmark,
  Settings,
  ShieldAlert,
  Vault,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents/new", label: "Report a New Fraud", icon: ShieldAlert },
  { href: "/cases", label: "My Cases", icon: FolderKanban },
  { href: "/agents", label: "AI Emergency Team", icon: Bot },
  { href: "/action-plans", label: "Action Plans", icon: ListChecks },
  { href: "/evidence", label: "Evidence Vault", icon: Vault },
  { href: "/reporting", label: "Official Reporting", icon: Landmark },
  { href: "/resources", label: "Resources", icon: BookOpen },
]

export const SECONDARY_NAV: NavItem[] = [{ href: "/settings", label: "Settings", icon: Settings }]

const EXTRA_TITLES: Record<string, string> = {
  "/profile": "Profile",
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getPageTitle(pathname: string) {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname]
  const all = [...MAIN_NAV, ...SECONDARY_NAV]
  // Prefer the most specific match.
  const match = all.filter((item) => isNavActive(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0]
  if (pathname.startsWith("/cases/")) return "Case Detail"
  if (pathname.startsWith("/action-plans/")) return "Action Plan"
  return match?.label ?? "STOPLOSS AI"
}
