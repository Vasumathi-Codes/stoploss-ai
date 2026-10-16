"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { LogOut, Menu, Moon, Settings, ShieldAlert, Sun, UserRound } from "lucide-react"
import { toast } from "sonner"

import { CommandSearch } from "@/components/layout/command-search"
import { NotificationsMenu } from "@/components/layout/notifications-menu"
import { SidebarNav } from "@/components/layout/app-sidebar"
import { Logo } from "@/components/shared/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useProfile } from "@/features/cases/hooks"
import { getPageTitle } from "@/lib/config/navigation"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AppHeader() {
  const profile = useProfile()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 items-center gap-2 px-4 md:gap-3 md:px-6">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="Open navigation">
              <Menu aria-hidden className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
            <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-4">
              <SheetTitle asChild>
                <div>
                  <Logo />
                </div>
              </SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
            </SheetHeader>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link href="/dashboard" className="lg:hidden" aria-label="STOPLOSS AI dashboard">
          <Logo collapsed />
        </Link>

        <p className="hidden truncate text-sm font-medium text-muted-foreground md:block" aria-live="polite">
          <Suspense fallback={null}>
            <PageTitle />
          </Suspense>
        </p>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <CommandSearch />
          <NotificationsMenu />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Profile menu">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                    {initials(profile.displayName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{profile.displayName}</p>
                <p className="text-xs text-muted-foreground">Demo profile · not signed in</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserRound aria-hidden />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                {resolvedTheme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
                Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  toast.info("Sign-in isn't available in Demo Mode", { description: "There is no real account to sign out of." })
                }
              >
                <LogOut aria-hidden />
                Sign out (unavailable)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild className="ml-1 hidden h-9 px-3 sm:inline-flex">
            <Link href="/incidents/new">
              <ShieldAlert aria-hidden />
              Report a New Fraud
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

/** Reads the pathname, so it must render inside Suspense (Cache Components). */
function PageTitle() {
  return getPageTitle(usePathname())
}
