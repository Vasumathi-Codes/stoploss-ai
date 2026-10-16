"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LifeBuoy, PanelLeftClose, PanelLeftOpen, Phone } from "lucide-react"

import { Logo } from "@/components/shared/logo"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useActiveIncidents } from "@/features/cases/hooks"
import { isNavActive, MAIN_NAV, type NavItem, SECONDARY_NAV } from "@/lib/config/navigation"
import { useUiPreferences } from "@/lib/store/ui-preferences"
import { cn } from "@/lib/utils"

function NavLink({
  item,
  collapsed,
  badge,
  onNavigate,
  pathname,
}: {
  item: NavItem
  collapsed: boolean
  badge?: number
  onNavigate?: () => void
  pathname: string | null
}) {
  const active = pathname !== null && isNavActive(pathname, item.href)
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors",
        "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
      <Icon aria-hidden className={cn("size-4.5 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto rounded-full bg-sidebar-primary/20 px-1.5 text-[11px] font-semibold text-sidebar-primary tabular-nums">
          {badge}
          <span className="sr-only"> active</span>
        </span>
      ) : null}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

interface SidebarNavProps {
  collapsed?: boolean
  onNavigate?: () => void
}

/**
 * With Cache Components, reading the pathname suspends on routes with runtime
 * params, so the active-state version renders inside Suspense and the fallback
 * is the same nav without a highlighted item.
 */
export function SidebarNav(props: SidebarNavProps) {
  return (
    <Suspense fallback={<SidebarNavContent {...props} pathname={null} />}>
      <SidebarNavWithPathname {...props} />
    </Suspense>
  )
}

function SidebarNavWithPathname(props: SidebarNavProps) {
  return <SidebarNavContent {...props} pathname={usePathname()} />
}

function SidebarNavContent({ collapsed = false, onNavigate, pathname }: SidebarNavProps & { pathname: string | null }) {
  const active = useActiveIncidents().length
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      <ul className="space-y-1">
        {MAIN_NAV.map((item) => (
          <li key={item.href}>
            <NavLink
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              pathname={pathname}
              badge={item.href === "/cases" ? active : undefined}
            />
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3">
        {!collapsed && (
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <LifeBuoy aria-hidden className="size-3.5 text-sidebar-primary" />
              Need to report a loss?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/70">
              India&apos;s cybercrime helpline is listed as <span className="font-semibold text-sidebar-foreground">1930</span>.
              Check numbers on Official Reporting.
            </p>
            <Link
              href="/reporting"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-primary hover:underline"
            >
              <Phone aria-hidden className="size-3" />
              Official channels
            </Link>
          </div>
        )}
        <ul className="space-y-1">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} pathname={pathname} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

export function AppSidebar() {
  const collapsed = useUiPreferences((s) => s.sidebarCollapsed)
  const toggle = useUiPreferences((s) => s.toggleSidebar)
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" aria-label="STOPLOSS AI dashboard" className="rounded-lg">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="text-sidebar-foreground/70"
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  )
}
