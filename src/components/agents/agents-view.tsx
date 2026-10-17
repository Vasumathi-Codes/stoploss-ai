"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Cpu, FlaskConical, Sparkles, Workflow } from "lucide-react"

import { AGENT_ICONS, AgentCard } from "@/components/agents/agent-card"
import { RunAnalysisButton } from "@/components/agents/run-analysis-button"
import { ActivityTimeline } from "@/components/shared/activity-timeline"
import { PageHeader, SectionHeading } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/states"
import { AgentStatusBadge, CaseStatusBadge, ProvenanceBadge, ToneBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAgentProvenance, useAgentState, useAnalysisEngine, useFindings, useTimeline } from "@/features/agents/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { useIncidents } from "@/features/cases/hooks"
import { AGENT_ORDER, AGENT_STAGES, AGENTS, agentInputs } from "@/lib/config/agents"
import { formatTime } from "@/lib/utils/format"
import type { AgentId, AgentRunState, Incident } from "@/types"

const NEXT_STEP: Record<AgentRunState["status"], string> = {
  not_started: "Run the analysis",
  analyzing: "Wait for this step to finish",
  awaiting_information: "Add a transaction reference or an evidence file to the case",
  needs_review: "Review the summary and add detail to your description if needed",
  completed: "Review the findings — no input needed",
}

export function AgentsView() {
  const incidents = useIncidents()
  const searchParams = useSearchParams()
  const requested = searchParams.get("case")
  const [selectedId, setSelectedId] = useState<string>(incidents.find((i) => i.id === requested)?.id ?? incidents[0]?.id ?? "")
  const incident = incidents.find((i) => i.id === selectedId) ?? incidents[0]
  const state = useAgentState(incident?.id)
  const { engine, model, copy } = useAnalysisEngine(incident?.id)
  const timeline = useTimeline(incident?.id)
  const agentEvents = useMemo(() => timeline.filter((e) => e.actor !== "user"), [timeline])

  if (!incident) {
    return <EmptyState title="No cases to analyse" description="Report an incident to see the AI Emergency Team at work." />
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <ToneBadge tone="primary" icon={engine === "foundry" ? Sparkles : FlaskConical}>
            {copy.title}
            {engine === "foundry" && model ? ` · ${model}` : ""}
          </ToneBadge>
        }
        title="AI Emergency Team"
        description={
          engine === "foundry"
            ? "Four specialised agents work on your case on Microsoft Foundry: the Incident Agent first, then the Containment and Evidence agents side by side, then the Recovery Coordinator, who combines everything. They advise only — they never contact anyone for you."
            : "Four specialised agents that work together on your case. In this demo they follow a fixed, deterministic script on the server — no AI model is called."
        }
      />

      <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-5">
        <div className="w-full max-w-md space-y-1.5">
          <Label htmlFor="agent-case">Case</Label>
          <Select value={incident.id} onValueChange={setSelectedId}>
            <SelectTrigger id="agent-case" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {incidents.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.reference} · {i.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CaseStatusBadge status={incident.status} />
          <RunAnalysisButton incident={incident} size="default" />
          <Button asChild variant="ghost">
            <Link href={`/cases/${incident.id}?tab=analysis`}>
              Open case analysis
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </Card>

      <section aria-labelledby="team" className="space-y-3">
        <SectionHeading id="team" title="Agents" description={`Working on ${incident.reference}`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AGENT_ORDER.map((id) => (
            <AgentCard key={id} agentId={id} state={state?.[id]} incident={incident} />
          ))}
        </div>
      </section>

      <section aria-labelledby="orchestration" className="space-y-3">
        <SectionHeading
          id="orchestration"
          title="Orchestration"
          description="Incident runs first, Containment and Evidence run side by side on its findings, and the Recovery Coordinator combines all three. Status is driven by the case's actual data."
        />
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {AGENT_ORDER.map((id) => (
            <AgentStepRow key={id} agentId={id} incident={incident} state={state?.[id]} />
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="activity" className="space-y-3">
          <SectionHeading id="activity" title="Agent activity" description="Shared timeline for this case (newest first)." />
          <Card className="p-5">
            {agentEvents.length ? (
              <ActivityTimeline events={agentEvents} dense />
            ) : (
              <p className="text-sm text-muted-foreground">No agent activity yet. {copy.emptyPrompt} to start.</p>
            )}
          </Card>
        </section>
        <section aria-labelledby="roadmap" className="space-y-3">
          <SectionHeading id="roadmap" title="About this demo" />
          <Card className="gap-3 p-5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Workflow aria-hidden className="size-4 text-primary" />
              What happens in a run
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>The Incident Agent summarises your report and lists missing details.</li>
              <li>The Containment Agent turns configured guidance into a prioritised action plan.</li>
              <li>The Evidence Agent inventories your files and flags a missing transaction reference.</li>
              <li>The Recovery Coordinator prepares a complaint checklist and tracks your progress.</li>
              <li>The case becomes ready for your review.</li>
            </ol>
            <p className="flex items-center gap-2 pt-2 font-medium">
              <Cpu aria-hidden className="size-4 text-primary" />
              Engine
            </p>
            <p className="text-muted-foreground">
              {engine === "foundry"
                ? "Agents run on a Microsoft Foundry model. AI findings are labelled and unverified, and the action plan itself comes from the app's configured guidance. Sample cases keep their template analysis until you rerun them."
                : "Microsoft Foundry is not configured, so agents use fixed templates and no analysis here was performed by AI. Set FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT to run them on a model."}
            </p>
          </Card>
        </section>
      </div>
    </div>
  )
}

function AgentStepRow({ agentId, incident, state }: { agentId: AgentId; incident: Incident; state?: AgentRunState }) {
  const findings = useFindings(incident.id, agentId)
  const provenance = useAgentProvenance(incident.id, agentId)
  const evidence = useEvidence(incident.id)
  const stage = AGENT_STAGES.findIndex((st) => st.includes(agentId))
  const parallel = AGENT_STAGES[stage].length > 1
  const Icon = AGENT_ICONS[agentId]
  const warnings = findings.filter(
    (f) => f.source === "unverified_assumption" || (f.items?.length && /gap|missing/i.test(f.title)),
  )
  const status = state?.status ?? "not_started"
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums">
          {stage + 1}
        </span>
        <Icon aria-hidden className="size-4 text-primary" />
        <p className="text-sm font-semibold">{AGENTS[agentId].name}</p>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Stage {stage + 1} of {AGENT_STAGES.length}
        {parallel ? " · runs in parallel" : ""}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <AgentStatusBadge status={status} />
        {status !== "analyzing" && <ProvenanceBadge provenance={provenance} />}
      </div>
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Task</dt>
          <dd className="line-clamp-4 text-sm" title={state?.currentTask}>
            {state?.currentTask}
          </dd>
        </div>
        <div className="flex gap-4">
          <div>
            <dt className="text-muted-foreground">Started</dt>
            <dd>{state?.startedAt ? formatTime(state.startedAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Finished</dt>
            <dd>{state?.completedAt && status !== "analyzing" ? formatTime(state.completedAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Findings</dt>
            <dd>{findings.length}</dd>
          </div>
        </div>
        <div>
          <dt className="text-muted-foreground">Supporting input</dt>
          <dd>
            {agentInputs(agentId).length === 0
              ? "Your report"
              : `Your report + ${agentInputs(agentId)
                  .map((id) => AGENTS[id].name)
                  .join(", ")}`}
          </dd>
        </div>
        {agentId === "evidence" && (
          <div>
            <dt className="text-muted-foreground">Evidence on record</dt>
            <dd>
              {evidence.length === 0 ? (
                "None yet"
              ) : (
                <Link href={`/evidence?case=${incident.id}`} className="text-primary hover:underline">
                  {evidence.length} {evidence.length === 1 ? "item" : "items"} (file details only — contents are not read)
                </Link>
              )}
            </dd>
          </div>
        )}
        {warnings.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Warnings</dt>
            <dd className="text-warning">{warnings.map((w) => w.title).join("; ")}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Next required step</dt>
          <dd className="text-sm">{NEXT_STEP[status]}</dd>
        </div>
      </dl>
    </li>
  )
}
