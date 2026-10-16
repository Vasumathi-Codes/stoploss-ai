import Link from "next/link"
import { Bot, CheckCircle2, Info, type LucideIcon, Settings2, TriangleAlert, User } from "lucide-react"

import { AGENTS } from "@/lib/config/agents"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/utils/format"
import { TONE_ICON, type Tone } from "@/lib/utils/tone"
import type { CaseTimelineEvent, Incident } from "@/types"

const TONE_MAP: Record<NonNullable<CaseTimelineEvent["tone"]>, { tone: Tone; icon?: LucideIcon; label: string }> = {
  neutral: { tone: "muted", label: "Update" },
  info: { tone: "info", icon: Info, label: "Information" },
  success: { tone: "success", icon: CheckCircle2, label: "Completed" },
  warning: { tone: "warning", icon: TriangleAlert, label: "Needs attention" },
}

const ACTOR_ICON: Record<CaseTimelineEvent["actor"], LucideIcon> = {
  user: User,
  agent: Bot,
  system: Settings2,
}

interface ActivityTimelineProps {
  events: CaseTimelineEvent[]
  /** Pass incidents to show a case reference link on each event. */
  incidents?: Incident[]
  className?: string
  dense?: boolean
}

export function ActivityTimeline({ events, incidents, className, dense }: ActivityTimelineProps) {
  const byId = incidents ? new Map(incidents.map((i) => [i.id, i])) : undefined
  return (
    <ol className={cn("relative", className)}>
      {events.map((e, idx) => {
        const meta = TONE_MAP[e.tone ?? "neutral"]
        const Icon = meta.icon ?? ACTOR_ICON[e.actor]
        const incident = byId?.get(e.incidentId)
        const last = idx === events.length - 1
        return (
          <li key={e.id} className={cn("relative flex gap-3", dense ? "pb-4" : "pb-5", last && "pb-0")}>
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />}
            <span
              className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full", TONE_ICON[meta.tone])}
            >
              <Icon aria-hidden className="size-4" />
              <span className="sr-only">{meta.label}</span>
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm leading-snug font-medium">{e.title}</p>
              {e.detail && <p className="mt-0.5 truncate text-sm text-muted-foreground">{e.detail}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                <span aria-hidden>·</span>
                <span>
                  {e.actor === "agent" && e.agentId
                    ? `${AGENTS[e.agentId].name} (simulated)`
                    : e.actor === "user"
                      ? "You"
                      : "System"}
                </span>
                {incident && (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={`/cases/${incident.id}`} className="font-medium text-primary hover:underline">
                      {incident.reference}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
