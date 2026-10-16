"use client"

import Link from "next/link"
import { ArrowLeft, Building2, CheckCircle2, FileQuestion, FolderOpen, Sparkles } from "lucide-react"

import { ActionChecklist } from "@/components/action-plans/action-item"
import { RunAnalysisButton } from "@/components/agents/run-analysis-button"
import { PageHeader, SectionHeading } from "@/components/shared/page-header"
import { ProgressIndicator } from "@/components/shared/progress-indicator"
import { EmptyState } from "@/components/shared/states"
import { CaseStatusBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useActions } from "@/features/action-plans/hooks"
import { computeProgress, useIncident } from "@/features/cases/hooks"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"

export function ActionPlanDetailView({ id }: { id: string }) {
  const incident = useIncident(id)
  const actions = useActions(id)

  if (!incident) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Action plan not found"
        description="There's no case with this ID. It may have been deleted, or the demo data may have been reset."
        action={
          <Button asChild>
            <Link href="/action-plans">
              <ArrowLeft aria-hidden />
              All action plans
            </Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }

  const progress = computeProgress(actions)
  const suggested = actions.filter((a) => a.origin === "suggested" && a.status !== "completed")
  const external = actions.filter((a) => a.origin === "external" && a.status !== "completed")
  const completed = actions.filter((a) => a.status === "completed")

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/action-plans", label: "Action Plans" }}
        eyebrow={
          <>
            <span className="font-mono text-sm font-medium text-primary">{incident.reference}</span>
            <CaseStatusBadge status={incident.status} />
          </>
        }
        title={`Action plan: ${incident.title}`}
        description={`${FRAUD_CATEGORIES[incident.category].label}. General guidance — not legal or financial advice.`}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/cases/${incident.id}`}>
              <FolderOpen aria-hidden />
              View linked case
            </Link>
          </Button>
        }
      />

      <Card className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:items-center">
        <ProgressIndicator done={progress.done} total={progress.total} label="Overall progress" />
        <Summary icon={Sparkles} label="Suggested to do" value={suggested.length} />
        <Summary icon={Building2} label="External, open" value={external.length} />
        <Summary icon={CheckCircle2} label="Completed by you" value={completed.length} />
      </Card>

      {actions.length === 0 ? (
        <EmptyState
          title="No plan generated yet"
          description="The Containment Agent builds the plan from the app's configured guidance when the analysis runs."
          action={<RunAnalysisButton incident={incident} size="default" />}
        />
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="suggested">
            <SectionHeading
              id="suggested"
              title="Suggested by STOPLOSS AI"
              description="Steps you can take yourself, based on configured guidance."
            />
            <ActionChecklist actions={suggested} emptyMessage="No suggested steps left open." />
          </section>
          <section className="space-y-3" aria-labelledby="external">
            <SectionHeading
              id="external"
              title="External processes"
              description="These happen with your bank or authorities. STOPLOSS AI can't see or verify them."
            />
            <ActionChecklist actions={external} emptyMessage="No external steps left open." />
          </section>
          <section className="space-y-3" aria-labelledby="completed">
            <SectionHeading
              id="completed"
              title="Completed by you"
              description="Self-reported. Reopen any step if you need to revisit it."
            />
            <ActionChecklist actions={completed} compact emptyMessage="Nothing marked complete yet." />
          </section>
        </>
      )}
    </div>
  )
}

function Summary({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden className="size-4.5 text-muted-foreground" />
      <div>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
