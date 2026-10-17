"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import {
  AlertTriangle,
  CheckCheck,
  ChevronDown,
  FileQuestion,
  Files,
  Info,
  List,
  Network,
  Receipt,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  X,
} from "lucide-react"

import { AddEvidenceDialog } from "@/components/evidence/add-evidence-dialog"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import { StatCard } from "@/components/shared/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAnalysisEngine } from "@/features/agents/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { useEvidenceGraph } from "@/features/evidence-graph/hooks"
import { EMPTY_FILTER, filterGraph, type GraphFilter, isFilterActive } from "@/lib/evidence/graph"
import { FACT_STATUS_LABELS, FACT_TYPE_LABELS, FACT_TYPE_ORDER, SOURCE_TYPE_LABELS } from "@/lib/evidence/labels"
import type { EvidenceGraph, EvidenceNode, FactDisplayStatus, FactNode, FactType, SourceType } from "@/lib/evidence/types"
import { cn } from "@/lib/utils"
import type { Incident } from "@/types"

import { conflictSelection, EvidenceDetailPanel } from "./evidence-detail-panel"
import { EvidenceGraphCanvas, GraphErrorBoundary } from "./evidence-graph-canvas"
import { EvidenceGraphList } from "./evidence-graph-list"
import type { KnownValues } from "./extract-facts-dialog"
import { SourceCard } from "./source-card"

type View = "graph" | "list"

/** Narrow screens start in the list view; the graph stays one tap away. */
function useIsNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  )
}

export function EvidenceIntelligenceTab({ incident }: { incident: Incident }) {
  const { state, reload, apply } = useEvidenceGraph(incident.id)
  const graph = state.graph

  if (!graph) {
    if (state.status === "error") {
      return (
        <ErrorState
          title="Evidence Intelligence couldn't load"
          description={state.error}
          action={
            <Button size="sm" onClick={() => void reload()}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          }
        />
      )
    }
    return <LoadingState label="Loading Evidence Intelligence…" rows={3} />
  }
  return (
    <Workspace
      incident={incident}
      graph={graph}
      refreshing={state.status === "loading"}
      stale={state.status === "error" ? state.error : undefined}
      reload={reload}
      apply={apply}
    />
  )
}

function Workspace({
  incident,
  graph,
  refreshing,
  stale,
  reload,
  apply,
}: {
  incident: Incident
  graph: EvidenceGraph
  refreshing: boolean
  stale?: string
  reload: () => Promise<void>
  apply: (g: EvidenceGraph | undefined) => void
}) {
  const evidence = useEvidence(incident.id)
  const { engine } = useAnalysisEngine()
  const narrow = useIsNarrow()
  const [viewChoice, setViewChoice] = useState<View | null>(null)
  const view: View = viewChoice ?? (narrow ? "list" : "graph")
  const [filter, setFilter] = useState<GraphFilter>(EMPTY_FILTER)
  const [selectedId, setSelectedId] = useState<string | undefined>()

  const visible = useMemo(() => filterGraph(graph, filter), [graph, filter])
  const evidenceNodes = graph.nodes.filter((n): n is EvidenceNode => n.type === "evidence")
  const facts = graph.nodes.filter((n): n is FactNode => n.type === "fact")
  const items = new Map(evidence.map((e) => [e.id, e]))
  const known: KnownValues = useMemo(
    () => ({
      references: new Set(facts.filter((f) => f.factType === "transaction_reference").map((f) => f.normalizedValue)),
      amounts: new Set(facts.filter((f) => f.factType === "amount").map((f) => Number(f.normalizedValue.split(":")[1]))),
    }),
    [facts],
  )
  const { summary } = graph
  const hasFiles = graph.summary.evidenceFiles > 0
  const nodeSelected = selectedId && !selectedId.startsWith("conflict:") ? selectedId : undefined

  const showEvidence = (nodeId: string) => {
    setFilter({ ...EMPTY_FILTER, evidenceNodeId: nodeId })
    setSelectedId(nodeId)
    document.getElementById("ei-graph")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const listFallback = (
    <div className="space-y-3">
      <p role="status" className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
        The graph couldn&apos;t be drawn, so the same information is shown as a list.
      </p>
      <EvidenceGraphList nodes={visible.nodes} edges={visible.edges} selectedId={nodeSelected} onSelect={setSelectedId} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* A. Header and metrics */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Evidence Intelligence</h2>
          <p className="text-sm text-muted-foreground">Connect the evidence. Verify the facts. Identify what is missing.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void reload()} disabled={refreshing}>
          <RefreshCw aria-hidden className={cn(refreshing && "motion-safe:animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {stale && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
          Couldn&apos;t refresh ({stale}). Showing the last loaded data.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Evidence files"
          value={summary.evidenceFiles}
          icon={Files}
          hint={`${graph.processingStatus.processed} analysed`}
        />
        <StatCard
          label="Transactions"
          value={summary.transactionCandidates}
          icon={Receipt}
          tone="info"
          hint="Distinct payments identified"
        />
        <StatCard
          label="Corroborated facts"
          value={summary.corroboratedFacts}
          icon={CheckCheck}
          tone="success"
          hint="Agreed by 2+ independent sources"
        />
        <StatCard
          label="Conflicts to review"
          value={summary.openConflicts}
          icon={Scale}
          tone={summary.openConflicts > 0 ? "danger" : "muted"}
          hint="Sources that disagree"
        />
        <StatCard
          label="Missing or unverified"
          value={summary.missingItems}
          icon={FileQuestion}
          tone={summary.missingItems > 0 ? "warning" : "muted"}
          hint={`${summary.unreviewedFacts} extracted ${summary.unreviewedFacts === 1 ? "fact" : "facts"} not reviewed`}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Connections are made by fixed, documented rules — not by AI — and never say who is responsible. A shared phone number or
        UPI ID only shows the records mention the same identifier. Extracted facts are unverified until you review them.
      </p>

      {/* B. Evidence overview */}
      <section aria-labelledby="ei-sources" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ei-sources" className="font-medium">
            Evidence sources
          </h3>
          <AddEvidenceDialog incidentId={incident.id} triggerLabel="Add evidence" />
        </div>
        {!hasFiles ? (
          <EmptyState
            title="No evidence added yet"
            description="Add a payment screenshot, your bank SMS, a statement PDF or a chat export. Each one you analyse is cross-checked against the others."
          />
        ) : (
          <>
            {graph.processingStatus.notProcessed > 0 && (
              <p role="status" className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 p-3 text-sm">
                <Info aria-hidden className="size-4 shrink-0 text-info" />
                {graph.processingStatus.notProcessed}{" "}
                {graph.processingStatus.notProcessed === 1 ? "file hasn't" : "files haven't"} been analysed. Nothing is read until
                you choose to.
              </p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {evidenceNodes.map((n) => (
                <li key={n.id}>
                  <SourceCard
                    node={n}
                    item={n.evidenceId ? items.get(n.evidenceId) : undefined}
                    incident={incident}
                    foundry={engine === "foundry"}
                    known={known}
                    selected={n.id === nodeSelected}
                    onGraph={apply}
                    onViewFacts={() => showEvidence(n.id)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* C–E. Graph, detail panel */}
      <Card id="ei-graph" className="scroll-mt-4">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Evidence graph</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Filters graph={graph} filter={filter} onChange={setFilter} />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(v) => v && setViewChoice(v as View)}
              aria-label="View"
            >
              <ToggleGroupItem value="graph" aria-label="Graph view">
                <Network aria-hidden />
                Graph
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <List aria-hidden />
                List
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {facts.length === 0 ? (
            <EmptyState
              title={hasFiles ? "Nothing analysed yet" : "Nothing to connect yet"}
              description={
                hasFiles
                  ? "Read a screenshot, statement or chat above to add its facts. The graph then shows how they connect."
                  : "Add evidence to start. The details you typed into the case will appear here too."
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-3">
                {summary.transactionCandidates === 0 && (
                  <p role="status" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                    No transaction identified yet. The facts so far don&apos;t describe a payment — add a payment confirmation,
                    bank SMS or statement.
                  </p>
                )}
                {isFilterActive(filter) && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    Showing {visible.nodes.filter((n) => n.type === "fact").length} of {facts.length} facts.
                    <Button size="xs" variant="outline" onClick={() => setFilter(EMPTY_FILTER)}>
                      <X aria-hidden />
                      Reset filters
                    </Button>
                  </p>
                )}
                {visible.nodes.length === 0 ? (
                  <EmptyState
                    title="No facts match these filters"
                    action={
                      <Button size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                        Reset filters
                      </Button>
                    }
                  />
                ) : view === "graph" ? (
                  <GraphErrorBoundary fallback={listFallback}>
                    <EvidenceGraphCanvas
                      nodes={visible.nodes}
                      edges={visible.edges}
                      selectedId={nodeSelected}
                      onSelect={setSelectedId}
                    />
                  </GraphErrorBoundary>
                ) : (
                  <EvidenceGraphList
                    nodes={visible.nodes}
                    edges={visible.edges}
                    selectedId={nodeSelected}
                    onSelect={setSelectedId}
                  />
                )}
              </div>
              <div className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-live="polite">
                <EvidenceDetailPanel
                  graph={graph}
                  incidentId={incident.id}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onGraph={apply}
                  onShowEvidence={showEvidence}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflicts and missing information */}
      {(graph.conflicts.length > 0 || graph.missingEvidence.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {graph.conflicts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale aria-hidden className="size-4 text-destructive" />
                  Conflicts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {graph.conflicts.map((c) => (
                    <li key={c.matchId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(conflictSelection(c.matchId))
                          document.getElementById("ei-graph")?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }}
                        className="w-full rounded-md border p-3 text-left text-sm hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="flex items-center justify-between gap-2 font-medium">
                          {FACT_TYPE_LABELS[c.factType]}
                          <span className="text-xs font-normal text-muted-foreground">
                            {c.reviewStatus === "open" ? "Open" : c.reviewStatus === "deferred" ? "Deferred" : "Reviewed"}
                          </span>
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {c.sides[0].displayValue} ({c.sides[0].sourceLabel}) vs {c.sides[1].displayValue} (
                          {c.sides[1].sourceLabel})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {graph.missingEvidence.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileQuestion aria-hidden className="size-4 text-warning" />
                  Missing or to verify next
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {graph.missingEvidence.map((m) => (
                    <li key={m.id} className="flex gap-2 text-sm">
                      {m.severity === "high" ? (
                        <AlertTriangle aria-label="Important" className="mt-0.5 size-4 shrink-0 text-warning" />
                      ) : (
                        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        <span className="font-medium">{m.title}</span>
                        <span className="block text-muted-foreground">{m.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Filters({ graph, filter, onChange }: { graph: EvidenceGraph; filter: GraphFilter; onChange: (f: GraphFilter) => void }) {
  const facts = graph.nodes.filter((n): n is FactNode => n.type === "fact")
  const sources = [...new Set(facts.map((f) => f.sourceType))] as SourceType[]
  const types = FACT_TYPE_ORDER.filter((t) => facts.some((f) => f.factType === t)) as FactType[]
  const statuses = [...new Set(facts.map((f) => f.displayStatus))] as FactDisplayStatus[]

  const toggle = <K extends "sourceTypes" | "factTypes" | "statuses">(key: K, value: GraphFilter[K][number], on: boolean) => {
    const list = filter[key] as string[]
    onChange({ ...filter, evidenceNodeId: undefined, [key]: on ? [...list, value] : list.filter((v) => v !== value) })
  }

  const menu = <K extends "sourceTypes" | "factTypes" | "statuses">(
    key: K,
    label: string,
    options: GraphFilter[K][number][],
    names: Record<string, string>,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Filter by ${label.toLowerCase()}`}>
          {label}
          {filter[key].length > 0 && (
            <span className="rounded bg-primary/15 px-1 text-xs text-primary tabular-nums">{filter[key].length}</span>
          )}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={(filter[key] as string[]).includes(o)}
            onCheckedChange={(c) => toggle(key, o, c === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {names[o]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
      <SlidersHorizontal aria-hidden className="size-4 text-muted-foreground" />
      {menu("sourceTypes", "Evidence type", sources, SOURCE_TYPE_LABELS)}
      {menu("factTypes", "Fact type", types, FACT_TYPE_LABELS)}
      {menu("statuses", "Review status", statuses, FACT_STATUS_LABELS)}
      {isFilterActive(filter) && (
        <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTER)}>
          <X aria-hidden />
          Reset
        </Button>
      )}
    </div>
  )
}
