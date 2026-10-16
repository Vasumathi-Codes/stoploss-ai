"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTimeline } from "@/features/agents/hooks"
import { useIncidents } from "@/features/cases/hooks"
import { demoService } from "@/lib/services"
import { useDemoStore } from "@/lib/store/demo-store"
import { useUiPreferences } from "@/lib/store/ui-preferences"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/utils/format"
import { TONE_DOT } from "@/lib/utils/tone"

export function NotificationsMenu() {
  const router = useRouter()
  const showAgent = useUiPreferences((s) => s.notifyAgentUpdates)
  const timeline = useTimeline(undefined, 40)
  const readIds = useDemoStore((s) => s.readEventIds)
  const incidents = useIncidents()
  const refs = useMemo(() => new Map(incidents.map((i) => [i.id, i.reference])), [incidents])

  const items = useMemo(
    () => timeline.filter((e) => e.actor !== "user" && (showAgent || e.actor !== "agent")).slice(0, 8),
    [timeline, showAgent],
  )
  const unread = items.filter((e) => !readIds.includes(e.id))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={`Notifications, ${unread.length} unread`}>
          <Bell aria-hidden className="size-4.5" />
          {unread.length > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.preventDefault()
                demoService.markEventsRead(unread.map((u) => u.id))
              }}
            >
              <CheckCheck aria-hidden />
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map((e) => {
            const isUnread = !readIds.includes(e.id)
            return (
              <DropdownMenuItem
                key={e.id}
                className="items-start gap-2.5 py-2"
                onSelect={() => {
                  demoService.markEventsRead([e.id])
                  router.push(`/cases/${e.incidentId}`)
                }}
              >
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", isUnread ? TONE_DOT.primary : "bg-transparent")}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", isUnread && "font-medium")}>{e.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {refs.get(e.incidentId)} · {formatDateTime(e.at)}
                    {isUnread && <span className="sr-only"> (unread)</span>}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
