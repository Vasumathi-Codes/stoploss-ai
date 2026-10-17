"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  FolderOpen,
  Hourglass,
  Landmark,
  ListTodo,
  Paperclip,
  ShieldAlert,
  Upload,
} from "lucide-react"

import { ActionChecklist } from "@/components/action-plans/action-item"
import { AgentCard } from "@/components/agents/agent-card"
import { RunAnalysisButton } from "@/components/agents/run-analysis-button"
import { AddEvidenceDialog } from "@/components/evidence/add-evidence-dialog"
import { ActivityTimeline } from "@/components/shared/activity-timeline"
import { ElapsedSince } from "@/components/shared/elapsed-since"
import { PageHeader, SectionHeading } from "@/components/shared/page-header"
import { ProgressIndicator } from "@/components/shared/progress-indicator"
import { StatCard } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/shared/states"
import { CaseStatusBadge, DemoDataBadge, OpenPriorityBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useActions, usePlan } from "@/features/action-plans/hooks"
import { useAgentState, useAnalysisEngine, useTimeline } from "@/features/agents/hooks"
import { useActiveIncidents, useIncidents, useProfile, useProgressByIncident } from "@/features/cases/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { AGENT_ORDER } from "@/lib/config/agents"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"

/** Open steps shown on the dashboard; the full plan is one click away. */
const PLAN_PREVIEW = 4

export function DashboardView() {
  const profile = useProfile()
  const incidents = useIncidents()
  const active = useActiveIncidents()
  const allActions = useActions()
  const evidence = useEvidence()
  const progress = useProgressByIncident()
  const recent = useTimeline(undefined, 6)
  const [uploadOpen, setUploadOpen] = useState(false)

  const current = active[0]
  const plan = usePlan(current?.id)
  const agentState = useAgentState(current?.id)
  const latestEvent = useTimeline(current?.id, 1)[0]
  const { engine, model } = useAnalysisEngine(current?.id)

  const stats = useMemo(() => {
    const activeIds = new Set(active.map((i) => i.id))
    const open = allActions.filter((a) => activeIds.has(a.incidentId) && a.status !== "completed")
    return {
      pending: open.length,
      urgent: open.filter((a) => a.priority === "urgent").length,
      completed: allActions.filter((a) => a.status === "completed").length,
    }
  }, [active, allActions])

  const openSteps = plan.ordered.filter((a) => a.status !== "completed")
  const p = current ? (progress.get(current.id) ?? { done: 0, total: 0 }) : { done: 0, total: 0 }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<DemoDataBadge />}
        title={`Welcome back, ${profile.displayName.split(" ")[0]}`}
        description="Here's where your cases stand and what to focus on next."
        actions={
          // The header shows this button from the `sm` breakpoint up.
          <Button asChild size="lg" className="h-10 px-4 sm:hidden">
            <Link href="/incidents/new">
              <ShieldAlert aria-hidden />
              Report a New Fraud
            </Link>
          </Button>
        }
      />

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Active cases"
          value={active.length}
          hint={`${incidents.length} in total`}
          icon={FolderKanban}
          tone="primary"
        />
        <StatCard
          label="Open steps"
          value={stats.pending}
          hint={stats.urgent > 0 ? `${stats.urgent} marked urgent` : "None marked urgent"}
          icon={ListTodo}
          tone={stats.urgent > 0 ? "danger" : "warning"}
        />
        <StatCard
          label="Evidence items"
          value={evidence.length}
          hint="File details saved with your cases"
          icon={Paperclip}
          tone="info"
        />
        <StatCard
          label="Steps completed"
          value={stats.completed}
          hint="Marked complete by you"
          icon={CheckCircle2}
          tone="success"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {current ? (
            <Card className="gap-0 overflow-hidden p-0">
              <div className="p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Most recently updated case</p>
                    <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-mono text-xs">{current.reference}</span> · {FRAUD_CATEGORIES[current.category].label}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CaseStatusBadge status={current.status} />
                    {plan.ordered.length > 0 && <OpenPriorityBadge priority={plan.priority} />}
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm md:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Amount reported</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatCurrency(current.amount, current.currency)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Reported</dt>
                    <dd>{formatDateTime(current.reportedAt)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hourglass aria-hidden className="size-3" />
                      Since you reported
                    </dt>
                    <dd>
                      <ElapsedSince iso={current.reportedAt} />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Latest event</dt>
                    <dd className="line-clamp-2" title={latestEvent?.title}>
                      {latestEvent?.title ?? "—"}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-col gap-4 border-t bg-muted/30 px-5 py-4 md:flex-row md:items-center md:px-6">
                <ProgressIndicator done={p.done} total={p.total} className="flex-1" />
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/cases/${current.id}`}>
                    Open case
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="No active cases"
              description="If something has just happened, start a report and STOPLOSS AI will help you organise your next steps."
              action={
                <Button asChild>
                  <Link href="/incidents/new">Report a New Fraud</Link>
                </Button>
              }
            />
          )}

          {current && (
            <section aria-labelledby="next-steps" className="space-y-3">
              <SectionHeading
                id="next-steps"
                title="What to do next"
                description={`${current.reference} · steps in suggested order. General guidance — adapt it to your situation.`}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/action-plans/${current.id}`}>
                      {openSteps.length > PLAN_PREVIEW ? `All ${plan.ordered.length} steps` : "Full plan"}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                }
              />
              <ActionChecklist
                actions={openSteps.slice(0, PLAN_PREVIEW)}
                numbered={{ start: plan.ordered.length - openSteps.length + 1 }}
                nextId={plan.next?.id}
                compact
                emptyMessage={
                  plan.ordered.length === 0
                    ? "No action plan yet. Run the agent analysis below to generate one."
                    : "All steps for this case are marked complete."
                }
              />
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <QuickAction href="/incidents/new" icon={ShieldAlert} label="Report a new fraud" />
              <QuickAction href="/cases" icon={FolderOpen} label="Open my cases" />
              <button type="button" onClick={() => setUploadOpen(true)} className={QUICK_ACTION_CLASS}>
                <Upload aria-hidden className="size-4 text-primary" />
                Upload evidence
              </button>
              <QuickAction href="/reporting" icon={Landmark} label="Official reporting channels" />
            </CardContent>
          </Card>
          <AddEvidenceDialog open={uploadOpen} onOpenChange={setUploadOpen} incidentId={undefined} hideTrigger />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent activity</CardTitle>
              {current && (
                <Link href="/agents" className="text-xs font-medium text-primary hover:underline">
                  View all
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {recent.length ? (
                <ActivityTimeline events={recent} incidents={incidents} dense />
              ) : (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {current && (
        <section aria-labelledby="ai-team" className="space-y-3">
          <SectionHeading
            id="ai-team"
            title="AI Emergency Team"
            description={
              engine === "foundry"
                ? `Agents on Microsoft Foundry${model ? ` (${model})` : ""} working on ${current.reference}. AI output is labelled and unverified.`
                : `Template agents working on ${current.reference}. No AI model is called.`
            }
            action={
              <div className="flex flex-wrap gap-2">
                <RunAnalysisButton incident={current} />
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/agents?case=${current.id}`}>
                    Agent activity
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {AGENT_ORDER.map((id) => (
              <AgentCard key={id} agentId={id} state={agentState?.[id]} incident={current} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const QUICK_ACTION_CLASS =
  "flex min-h-20 flex-col items-start justify-between gap-2 rounded-lg border bg-background/40 p-3 text-left text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
}) {
  return (
    <Link href={href} className={QUICK_ACTION_CLASS}>
      <Icon aria-hidden className="size-4 text-primary" />
      {label}
    </Link>
  )
}
