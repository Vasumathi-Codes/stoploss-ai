"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  MoreHorizontal,
  RotateCcw,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { CaseAnalysisTab } from "@/components/cases/case-analysis-tab"
import { CaseNotesTab } from "@/components/cases/case-notes-tab"
import { CaseOverviewTab } from "@/components/cases/case-overview-tab"
import { ActionChecklist } from "@/components/action-plans/action-item"
import { AddEvidenceDialog } from "@/components/evidence/add-evidence-dialog"
import { EvidenceCard } from "@/components/evidence/evidence-card"
import { ActivityTimeline } from "@/components/shared/activity-timeline"
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { ProgressIndicator } from "@/components/shared/progress-indicator"
import { EmptyState } from "@/components/shared/states"
import { CaseStatusBadge, DemoDataBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActions } from "@/features/action-plans/hooks"
import { useTimeline } from "@/features/agents/hooks"
import { computeProgress, useIncident, useIncidents } from "@/features/cases/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { CASE_STATUSES, FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { caseService } from "@/lib/services"
import type { CaseStatus } from "@/types"

const TABS = ["overview", "analysis", "actions", "evidence", "timeline", "notes"] as const
type Tab = (typeof TABS)[number]

export function CaseDetailView({ id }: { id: string }) {
  const incident = useIncident(id)
  const incidents = useIncidents()
  const actions = useActions(id)
  const evidence = useEvidence(id)
  const timeline = useTimeline(id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab")
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "overview")
  const [pendingStatus, setPendingStatus] = useState<CaseStatus | null>(null)

  if (!incident) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="We couldn't find that case"
        description="It may have been deleted, or the demo data may have been reset."
        action={
          <Button asChild>
            <Link href="/cases">
              <ArrowLeft aria-hidden />
              Back to My Cases
            </Link>
          </Button>
        }
        className="mt-10"
      />
    )
  }

  const progress = computeProgress(actions)
  const index = incidents.findIndex((i) => i.id === id)
  const prev = incidents[index - 1]
  const next = incidents[index + 1]

  const statusChange = async (status: CaseStatus) => {
    if (!(await caseService.updateStatus(incident.id, status))) return
    toast.success("Case status updated", { description: `${incident.reference} is now “${CASE_STATUSES[status].label}”.` })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/cases">
            <ArrowLeft aria-hidden />
            My Cases
          </Link>
        </Button>
        <nav aria-label="Case navigation" className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!prev}
            onClick={() => prev && router.push(`/cases/${prev.id}`)}
            aria-label="Previous case"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {index + 1} / {incidents.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!next}
            onClick={() => next && router.push(`/cases/${next.id}`)}
            aria-label="Next case"
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </div>

      <PageHeader
        eyebrow={
          <>
            <span className="font-mono text-sm font-medium text-primary">{incident.reference}</span>
            <CaseStatusBadge status={incident.status} />
            {incident.isSample && <DemoDataBadge label="Fictional sample case" />}
          </>
        }
        title={incident.title}
        description={FRAUD_CATEGORIES[incident.category].label}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/action-plans/${incident.id}`}>
                Action plan
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Case actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Update case status</DropdownMenuLabel>
                {incident.status !== "reporting_in_progress" &&
                  incident.status !== "resolved" &&
                  incident.status !== "archived" && (
                    <DropdownMenuItem onSelect={() => statusChange("reporting_in_progress")}>
                      <Send aria-hidden />
                      I&apos;m working on official reporting
                    </DropdownMenuItem>
                  )}
                {incident.status !== "resolved" && (
                  <DropdownMenuItem onSelect={() => setPendingStatus("resolved")}>
                    <CheckCircle2 aria-hidden />
                    Mark as resolved
                  </DropdownMenuItem>
                )}
                {(incident.status === "resolved" || incident.status === "archived") && (
                  <DropdownMenuItem onSelect={() => statusChange("action_plan_ready")}>
                    <RotateCcw aria-hidden />
                    Reopen case
                  </DropdownMenuItem>
                )}
                {incident.status !== "archived" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setPendingStatus("archived")}>
                      <Archive aria-hidden />
                      Archive case
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ProgressIndicator done={progress.done} total={progress.total} className="max-w-xl" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line" className="w-max justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="actions">
              Action Plan <span className="text-muted-foreground tabular-nums">({progress.total - progress.done})</span>
            </TabsTrigger>
            <TabsTrigger value="evidence">
              Evidence <span className="text-muted-foreground tabular-nums">({evidence.length})</span>
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="notes">
              Notes <span className="text-muted-foreground tabular-nums">({incident.notes.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <CaseOverviewTab incident={incident} actions={actions} evidenceCount={evidence.length} onNavigate={(t) => setTab(t)} />
        </TabsContent>

        <TabsContent value="analysis">
          <CaseAnalysisTab incident={incident} />
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Suggested steps are general guidance. External steps happen outside STOPLOSS AI, so only you can mark them complete.
          </p>
          <ActionChecklist
            actions={actions}
            emptyMessage="No action plan yet. Run the simulated analysis from the AI Analysis tab to generate one."
          />
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Files stay on your device — only their names, types and sizes are saved. Previews are available in the tab where you
              added them.
            </p>
            <AddEvidenceDialog incidentId={incident.id} triggerLabel="Add evidence" />
          </div>
          {evidence.length === 0 ? (
            <EmptyState title="No evidence yet" description="Screenshots of payments, chats and SMS are a good place to start." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {evidence.map((e) => (
                <li key={e.id}>
                  <EvidenceCard item={e} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <div className="rounded-xl border bg-card p-5">
            <ActivityTimeline events={timeline} />
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <CaseNotesTab incident={incident} />
        </TabsContent>
      </Tabs>

      <ConfirmationDialog
        open={pendingStatus !== null}
        onOpenChange={(o) => !o && setPendingStatus(null)}
        title={pendingStatus === "archived" ? "Archive this case?" : "Mark this case as resolved?"}
        description={
          pendingStatus === "archived" ? (
            <p>
              The case will be hidden from active views. You can find it by filtering My Cases by “Archived” and reopen it
              anytime.
            </p>
          ) : (
            <p>
              This only records that <span className="font-medium text-foreground">you</span> consider the case resolved in
              STOPLOSS AI. It doesn&apos;t notify your bank or any authority.
            </p>
          )
        }
        confirmLabel={pendingStatus === "archived" ? "Archive case" : "Mark as resolved"}
        destructive={pendingStatus === "archived"}
        onConfirm={() => pendingStatus && statusChange(pendingStatus)}
      />
    </div>
  )
}
