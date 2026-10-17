"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Building2, CheckCircle2, ListChecks, Sparkles } from "lucide-react"

import { ActionChecklist } from "@/components/action-plans/action-item"
import { PageHeader } from "@/components/shared/page-header"
import { ProgressIndicator } from "@/components/shared/progress-indicator"
import { ALL, SearchAndFilterBar } from "@/components/shared/search-and-filter-bar"
import { StatCard } from "@/components/shared/stat-card"
import { EmptyState } from "@/components/shared/states"
import { CaseStatusBadge, OpenPriorityBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActions } from "@/features/action-plans/hooks"
import { computeProgress, useIncidents } from "@/features/cases/hooks"
import { PRIORITIES } from "@/lib/config/taxonomy"
import { nextStep, openPriority } from "@/lib/plan"

export function ActionPlansView() {
  const incidents = useIncidents()
  const actions = useActions()
  const [query, setQuery] = useState("")
  const [priority, setPriority] = useState(ALL)
  const [caseId, setCaseId] = useState(ALL)
  const [origin, setOrigin] = useState(ALL)

  const plans = useMemo(
    () =>
      incidents
        .filter((i) => i.status !== "archived")
        .map((i) => {
          const list = actions.filter((a) => a.incidentId === i.id)
          return {
            incident: i,
            list,
            progress: computeProgress(list),
            next: nextStep(list),
            priority: openPriority(list),
          }
        }),
    [incidents, actions],
  )

  const summary = useMemo(
    () => ({
      suggestedOpen: actions.filter((a) => a.origin === "suggested" && a.status !== "completed").length,
      externalOpen: actions.filter((a) => a.origin === "external" && a.status !== "completed").length,
      completed: actions.filter((a) => a.status === "completed").length,
    }),
    [actions],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return actions.filter((a) => {
      if (caseId !== ALL && a.incidentId !== caseId) return false
      if (origin !== ALL && a.origin !== origin) return false
      if (priority === "completed") {
        if (a.status !== "completed") return false
      } else if (priority !== ALL && (a.priority !== priority || a.status === "completed")) return false
      return !q || a.title.toLowerCase().includes(q)
    })
  }, [actions, query, priority, caseId, origin])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action Plans"
        description="Response steps across your cases. Opening a link never marks a step complete — only you can do that."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Suggested steps to do"
          value={summary.suggestedOpen}
          icon={Sparkles}
          tone="primary"
          hint="Proposed by STOPLOSS AI guidance"
        />
        <StatCard
          label="External processes open"
          value={summary.externalOpen}
          icon={Building2}
          tone="info"
          hint="Outside the app — can't be verified by it"
        />
        <StatCard
          label="Completed by you"
          value={summary.completed}
          icon={CheckCircle2}
          tone="success"
          hint="Self-reported progress"
        />
      </div>

      <Tabs defaultValue="cases" className="gap-5">
        <TabsList>
          <TabsTrigger value="cases">By case</TabsTrigger>
          <TabsTrigger value="all">All actions</TabsTrigger>
        </TabsList>

        <TabsContent value="cases">
          {plans.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No action plans yet"
              description="Action plans appear after a case is analysed."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {plans.map(({ incident, list, progress, next, priority }) => (
                <li key={incident.id}>
                  <Card className="h-full gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium text-primary">{incident.reference}</p>
                        <p className="font-medium">{incident.title}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <CaseStatusBadge status={incident.status} />
                        {list.length > 0 && <OpenPriorityBadge priority={priority} />}
                      </div>
                    </div>
                    <ProgressIndicator done={progress.done} total={progress.total} />
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No plan generated yet — run the agent analysis.</p>
                    ) : next ? (
                      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="text-xs text-muted-foreground">Next step</p>
                        <p className="font-medium">{next.title}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">All steps marked complete.</p>
                    )}
                    <Button asChild variant="secondary" size="sm" className="mt-auto w-fit">
                      <Link href={`/action-plans/${incident.id}`}>
                        Open plan
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <SearchAndFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search actions"
            filters={[
              {
                id: "priority",
                label: "Priorities",
                value: priority,
                onChange: setPriority,
                options: (["urgent", "high", "normal", "completed"] as const).map((p) => ({
                  value: p,
                  label: PRIORITIES[p].label,
                })),
              },
              {
                id: "origin",
                label: "Types",
                value: origin,
                onChange: setOrigin,
                options: [
                  { value: "suggested", label: "Suggested steps" },
                  { value: "external", label: "External processes" },
                ],
              },
              {
                id: "case",
                label: "Cases",
                value: caseId,
                onChange: setCaseId,
                options: incidents.map((i) => ({ value: i.id, label: i.reference })),
              },
            ]}
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} action{filtered.length === 1 ? "" : "s"}
          </p>
          <ActionChecklist actions={filtered} incidents={incidents} emptyMessage="No actions match these filters." />
        </TabsContent>
      </Tabs>
    </div>
  )
}
