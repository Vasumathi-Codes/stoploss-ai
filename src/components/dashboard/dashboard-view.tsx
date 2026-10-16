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
import { CaseStatusBadge, DemoDataBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useActions } from "@/features/action-plans/hooks"
import { useAgentState, useTimeline } from "@/features/agents/hooks"
import { useActiveIncidents, useIncidents, useProfile, useProgressByIncident } from "@/features/cases/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { AGENT_ORDER } from "@/lib/config/agents"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"

export function DashboardView() {
  const profile = useProfile()
  const incidents = useIncidents()
  const active = useActiveIncidents()
  const allActions = useActions()
  const evidence = useEvidence()
  const progress = useProgressByIncident()
  const recent = useTimeline(undefined, 7)
  const [uploadOpen, setUploadOpen] = useState(false)

  const current = active[0]
  const currentActions = useActions(current?.id)
  const agentState = useAgentState(current?.id)
  const latestEvent = useTimeline(current?.id, 1)[0]

  const stats = useMemo(() => {
    const activeIds = new Set(active.map((i) => i.id))
    return {
      pending: allActions.filter((a) => activeIds.has(a.incidentId) && a.status !== "completed").length,
      completed: allActions.filter((a) => a.status === "completed").length,
    }
  }, [active, allActions])

  const openActions = currentActions.filter((a) => a.status !== "completed").slice(0, 4)
  const p = current ? (progress.get(current.id) ?? { done: 0, total: 0 }) : { done: 0, total: 0 }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<DemoDataBadge />}
        title={`Welcome back, ${profile.displayName.split(" ")[0]}`}
        description="When every minute matters, know what to do next. Here's where your cases stand and what to focus on now."
        actions={
          <Button asChild size="lg" className="h-10 px-4">
            <Link href="/incidents/new">
              <ShieldAlert aria-hidden />
              Report a New Fraud
            </Link>
          </Button>
        }
      />

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Active Cases"
          value={active.length}
          hint={`${incidents.length} cases in total`}
          icon={FolderKanban}
          tone="primary"
        />
        <StatCard
          label="Action Items Pending"
          value={stats.pending}
          hint="Across your active cases"
          icon={ListTodo}
          tone="warning"
        />
        <StatCard
          label="Evidence Items Collected"
          value={evidence.length}
          hint="File details saved with your cases"
          icon={Paperclip}
          tone="info"
        />
        <StatCard
          label="Completed Response Steps"
          value={stats.completed}
          hint="Marked complete by you"
          icon={CheckCircle2}
          tone="success"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {current ? (
            <Card className="gap-0 overflow-hidden p-0">
              <div className="border-b bg-gradient-to-br from-primary/12 via-transparent to-transparent p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                      Most recently updated active case
                    </p>
                    <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {current.reference} · {FRAUD_CATEGORIES[current.category].label}
                    </p>
                  </div>
                  <CaseStatusBadge status={current.status} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Approx. amount reported</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatCurrency(current.amount, current.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reported</dt>
                    <dd>{formatDateTime(current.reportedAt)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hourglass aria-hidden className="size-3" />
                      Elapsed since you reported
                    </dt>
                    <dd>
                      <ElapsedSince iso={current.reportedAt} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Latest event</dt>
                    <dd className="line-clamp-2">{latestEvent?.title ?? "—"}</dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:p-6">
                <ProgressIndicator done={p.done} total={p.total} className="flex-1" />
                <Button asChild variant="secondary">
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
            <section aria-labelledby="immediate-actions" className="space-y-3">
              <SectionHeading
                id="immediate-actions"
                title="Immediate actions"
                description={`Prioritised for ${current.reference}. General guidance — adapt it to your situation.`}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/action-plans/${current.id}`}>
                      Full action plan
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                }
              />
              <ActionChecklist
                actions={openActions}
                compact
                emptyMessage={
                  currentActions.length === 0
                    ? "No action plan yet. Run the agent analysis below to generate one."
                    : "All steps for this case are marked complete."
                }
              />
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <QuickAction href="/incidents/new" icon={ShieldAlert} label="Report a New Fraud" />
              <QuickAction href="/cases" icon={FolderOpen} label="Open My Cases" />
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="flex flex-col items-start gap-2 rounded-xl border bg-background/40 p-3 text-left text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <Upload aria-hidden className="size-4.5 text-primary" />
                Upload Evidence
              </button>
              <QuickAction href="/reporting" icon={Landmark} label="View Official Reporting Channels" />
            </CardContent>
          </Card>
          <AddEvidenceDialog open={uploadOpen} onOpenChange={setUploadOpen} incidentId={undefined} hideTrigger />

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
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
            description={`Simulated demo agents working on ${current.reference}. No AI model is called.`}
            action={
              <div className="flex gap-2">
                <RunAnalysisButton incident={current} />
                <Button asChild variant="ghost" size="sm">
                  <Link href="/agents">
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
    <Link
      href={href}
      className="flex flex-col items-start gap-2 rounded-xl border bg-background/40 p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <Icon aria-hidden className="size-4.5 text-primary" />
      {label}
    </Link>
  )
}
