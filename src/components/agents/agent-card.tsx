"use client"

import { useState } from "react"
import Link from "next/link"
import { FileSearch, ListChecks, type LucideIcon, ScanSearch, Send } from "lucide-react"

import { FindingsList } from "@/components/agents/findings-list"
import { AgentStatusBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useFindings } from "@/features/agents/hooks"
import { AGENTS } from "@/lib/config/agents"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/utils/format"
import type { AgentId, AgentRunState, Incident } from "@/types"

export const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  incident: ScanSearch,
  containment: ListChecks,
  evidence: FileSearch,
  recovery: Send,
}

interface AgentCardProps {
  agentId: AgentId
  state: AgentRunState | undefined
  incident: Incident | undefined
  className?: string
}

export function AgentCard({ agentId, state, incident, className }: AgentCardProps) {
  const [open, setOpen] = useState(false)
  const agent = AGENTS[agentId]
  const Icon = AGENT_ICONS[agentId]
  const findings = useFindings(incident?.id, agentId)
  const latest = findings.find((f) => f.source === "mock_analysis") ?? findings[0]
  const status = state?.status ?? "not_started"

  return (
    <Card className={cn("gap-0 p-4", status === "analyzing" && "ring-1 ring-primary/50", className)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary",
            status === "analyzing" && "motion-safe:animate-pulse",
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-semibold">{agent.name}</p>
          <p className="text-xs text-muted-foreground">{agent.role}</p>
        </div>
      </div>
      <div className="mt-3">
        <AgentStatusBadge status={status} />
      </div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Current task</dt>
          <dd className="leading-snug">{state?.currentTask ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latest finding</dt>
          <dd className="line-clamp-2 leading-snug text-muted-foreground">
            {latest ? `${latest.title}. ${latest.detail}` : "No findings yet."}
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {incident ? (
          <Link href={`/cases/${incident.id}`} className="truncate text-xs font-medium text-primary hover:underline">
            {incident.reference}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">No case selected</span>
        )}
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!incident}>
          View Details
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon aria-hidden className="size-5 text-primary" />
              {agent.name}
              <span className="text-sm font-normal text-muted-foreground">· {incident?.reference}</span>
            </DialogTitle>
            <DialogDescription>{agent.purpose}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <AgentStatusBadge status={status} />
            {state?.startedAt && <span>Started {formatDateTime(state.startedAt)}</span>}
            {state?.completedAt && <span>· Finished {formatDateTime(state.completedAt)}</span>}
          </div>
          <FindingsList findings={findings} emptyMessage="This agent hasn't produced any findings for this case yet." />
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Simulated demo analysis. Findings come from fixed templates and the details you entered; no AI model was used.
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
