"use client"

import { FlaskConical } from "lucide-react"

import { AGENT_ICONS } from "@/components/agents/agent-card"
import { FindingsList } from "@/components/agents/findings-list"
import { RunAnalysisButton } from "@/components/agents/run-analysis-button"
import { AgentStatusBadge, FindingSourceBadge } from "@/components/shared/status-badges"
import { Card } from "@/components/ui/card"
import { useAgentState, useFindings } from "@/features/agents/hooks"
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { FINDING_SOURCES } from "@/lib/config/taxonomy"
import type { AgentId, FindingSource, Incident } from "@/types"

export function CaseAnalysisTab({ incident }: { incident: Incident }) {
  const agents = useAgentState(incident.id)
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Simulated Demo Analysis</p>
            <p className="text-muted-foreground">
              Generated in your browser from fixed templates and your inputs. No AI model, Microsoft Foundry or external check is
              involved.
            </p>
          </div>
        </div>
        <RunAnalysisButton incident={incident} />
      </div>

      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">What do the source labels mean?</summary>
        <ul className="mt-3 space-y-2">
          {(Object.keys(FINDING_SOURCES) as FindingSource[]).map((s) => (
            <li key={s} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <FindingSourceBadge source={s} className="w-fit" />
              <span className="text-muted-foreground">{FINDING_SOURCES[s].description}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        {AGENT_ORDER.map((id) => (
          <AgentFindingsCard
            key={id}
            agentId={id}
            incidentId={incident.id}
            status={agents?.[id].status ?? "not_started"}
            task={agents?.[id].currentTask}
          />
        ))}
      </div>
    </div>
  )
}

function AgentFindingsCard({
  agentId,
  incidentId,
  status,
  task,
}: {
  agentId: AgentId
  incidentId: string
  status: Parameters<typeof AgentStatusBadge>[0]["status"]
  task?: string
}) {
  const findings = useFindings(incidentId, agentId)
  const Icon = AGENT_ICONS[agentId]
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon aria-hidden className="size-4.5" />
          </span>
          <div>
            <p className="font-semibold">{AGENTS[agentId].name}</p>
            <p className="text-xs text-muted-foreground">{task}</p>
          </div>
        </div>
        <AgentStatusBadge status={status} />
      </div>
      <FindingsList
        findings={findings}
        emptyMessage={status === "analyzing" ? "Working on it…" : "No findings yet. Run the simulated analysis to generate them."}
      />
    </Card>
  )
}
