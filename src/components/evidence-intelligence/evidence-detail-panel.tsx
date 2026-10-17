"use client"

import { useState } from "react"
import { Check, Eye, EyeOff, Filter, Loader2, MousePointerClick, PencilLine, RotateCcw, Scale, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  EXTRACTION_METHOD_LABELS,
  FACT_TYPE_LABELS,
  OUTCOME_LABELS,
  RELATION_LABELS,
  SOURCE_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
} from "@/lib/evidence/labels"
import { CORRECTABLE_TYPES } from "@/lib/evidence/normalize"
import type { EvidenceGraph, EvidenceNode, FactNode, GraphConflict, GraphNode, TransactionNode } from "@/lib/evidence/types"
import { evidenceGraphService } from "@/lib/services"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { FactReviewBody } from "@/lib/validation/evidence-graph"

import { FactStatusBadge, ProcessingBadge, TransactionStatusBadge } from "./meta"

export const conflictSelection = (matchId: string) => `conflict:${matchId}`

interface PanelProps {
  graph: EvidenceGraph
  incidentId: string
  selectedId?: string
  onSelect: (id: string | undefined) => void
  onGraph: (graph: EvidenceGraph | undefined) => void
  onShowEvidence: (nodeId: string) => void
}

/** Details and review actions for the selected node or conflict. */
export function EvidenceDetailPanel(props: PanelProps) {
  const { graph, selectedId } = props
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  if (!selectedId) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <MousePointerClick aria-hidden className="size-5" />
        Select a file, fact, transaction or conflict to see where it comes from and how it connects.
      </div>
    )
  }
  if (selectedId.startsWith("conflict:")) {
    const conflict = graph.conflicts.find((c) => c.matchId === selectedId.slice(9))
    return conflict ? <ConflictDetail {...props} conflict={conflict} /> : <Gone onClose={() => props.onSelect(undefined)} />
  }
  const node = byId.get(selectedId)
  if (!node) return <Gone onClose={() => props.onSelect(undefined)} />
  if (node.type === "fact") return <FactDetail {...props} fact={node} byId={byId} />
  if (node.type === "transaction") return <TransactionDetail {...props} tx={node} />
  return <EvidenceDetail {...props} node={node} />
}

function Gone({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border p-4 text-sm">
      <p>This item is no longer in the graph (it may have been filtered out or removed).</p>
      <Button size="sm" variant="outline" onClick={onClose}>
        Clear selection
      </Button>
    </div>
  )
}

function PanelShell({
  title,
  kicker,
  onClose,
  children,
}: {
  title: React.ReactNode
  kicker: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <section aria-label={`${kicker} details`} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kicker}</p>
          <h4 className="font-semibold break-words">{title}</h4>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <X aria-hidden />
        </Button>
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fact                                                                */
/* ------------------------------------------------------------------ */

function FactDetail({
  graph,
  incidentId,
  fact,
  byId,
  onSelect,
  onGraph,
}: PanelProps & { fact: FactNode; byId: Map<string, GraphNode> }) {
  const [reveal, setReveal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const source = byId.get(fact.evidenceNodeId) as EvidenceNode | undefined
  const links = graph.edges.filter((e) => (e.source === fact.id || e.target === fact.id) && e.relation !== "extracted_from")
  const conflicts = graph.conflicts.filter((c) => c.sides.some((s) => s.factId === fact.factId))
  const masked = fact.displayValue !== fact.rawValue

  const act = async (body: FactReviewBody, label: string) => {
    setBusy(label)
    try {
      const next = await evidenceGraphService.review(incidentId, fact.factId, body)
      onGraph(next)
      if (next && body.action === "correct") setEditing(false)
    } finally {
      setBusy(null)
    }
  }
  const at = { expectedUpdatedAt: fact.updatedAt }

  return (
    <PanelShell kicker="Fact" title={fact.label} onClose={() => onSelect(undefined)}>
      <div className="space-y-1">
        <p className={fact.factType === "transaction_reference" ? "font-mono text-lg font-semibold" : "text-lg font-semibold"}>
          {reveal ? fact.rawValue : fact.displayValue}
        </p>
        {masked && (
          <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
            {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {reveal ? "Hide full value" : "Show full value"}
          </Button>
        )}
        <div className="pt-1">
          <FactStatusBadge status={fact.displayStatus} />
        </div>
      </div>

      <dl className="grid gap-3">
        {fact.correctedValue && <Row label="Your correction (used for matching)">{fact.correctedValue}</Row>}
        {reveal && <Row label="Normalised for comparison">{fact.normalizedValue}</Row>}
        <Row label="Source">
          {source?.label ?? SOURCE_TYPE_LABELS[fact.sourceType]}
          {fact.sourceLocation && <span className="text-muted-foreground"> · {fact.sourceLocation}</span>}
        </Row>
        <Row label="Kind of source">{SOURCE_TYPE_LABELS[fact.sourceType]}</Row>
        <Row label="Found by">
          {EXTRACTION_METHOD_LABELS[fact.extractionMethod]}
          {fact.extractorVersion && <span className="block text-xs text-muted-foreground">{fact.extractorVersion}</span>}
        </Row>
        <Row label="Role">
          {fact.recordRole === "context" ? "Context (mentioned, not a payment record)" : "Part of a payment record"}
        </Row>
        <Row label="Confirmed by you">{fact.userConfirmed ? "Yes" : "No"}</Row>
        <Row label="Last updated">{formatDateTime(fact.updatedAt)}</Row>
      </dl>

      {links.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Why it is connected</h5>
          <ul className="space-y-2">
            {links.map((e) => {
              const other = byId.get(e.source === fact.id ? e.target : e.source)
              return (
                <li key={e.id} className="rounded-md border p-2.5 text-xs">
                  <p className="font-medium">
                    {RELATION_LABELS[e.relation]}
                    {e.outcome && <span className="text-muted-foreground"> · {OUTCOME_LABELS[e.outcome]}</span>}
                    {other && (
                      <button type="button" className="ml-1 text-primary hover:underline" onClick={() => onSelect(other.id)}>
                        →{" "}
                        {other.type === "fact"
                          ? `${other.label} (${(byId.get(other.evidenceNodeId) as EvidenceNode | undefined)?.label ?? "case"})`
                          : other.label}
                      </button>
                    )}
                  </p>
                  <p className="mt-1 text-muted-foreground">{e.explanation}</p>
                  {e.uncertainty && <p className="mt-1 text-muted-foreground italic">{e.uncertainty}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-1.5">
          {conflicts.map((c) => (
            <Button
              key={c.matchId}
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(conflictSelection(c.matchId))}
            >
              <Scale aria-hidden />
              Compare conflicting values{c.reviewStatus !== "open" ? ` (${c.reviewStatus})` : ""}
            </Button>
          ))}
        </div>
      )}

      {fact.reviewable ? (
        <div className="space-y-2 border-t pt-3">
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your review</h5>
          <p className="text-xs text-muted-foreground">
            Extracted values can be misread. Matching never confirms a fact for you — only your review does.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              onClick={() => act({ action: "confirm", ...at }, "confirm")}
              disabled={busy !== null || fact.reviewStatus === "user_confirmed" || fact.reviewStatus === "user_corrected"}
            >
              {busy === "confirm" ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
              Confirm
            </Button>
            {CORRECTABLE_TYPES.includes(fact.factType) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing((e) => !e)}
                disabled={busy !== null}
                aria-expanded={editing}
              >
                <PencilLine aria-hidden />
                Correct
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => act({ action: "mark_needs_verification", ...at }, "verify")}
              disabled={busy !== null || fact.reviewStatus === "needs_verification"}
            >
              Needs checking
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => act({ action: "reject", ...at }, "reject")}
              disabled={busy !== null || fact.reviewStatus === "user_rejected"}
            >
              <X aria-hidden />
              Reject
            </Button>
            {fact.reviewStatus !== "unreviewed" && (
              <Button size="sm" variant="ghost" onClick={() => act({ action: "reset", ...at }, "reset")} disabled={busy !== null}>
                <RotateCcw aria-hidden />
                Reset
              </Button>
            )}
          </div>
          {editing && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (value.trim()) void act({ action: "correct", value: value.trim(), ...at }, "correct")
              }}
            >
              <Label htmlFor={`correct-${fact.factId}`} className="text-xs">
                Correct {FACT_TYPE_LABELS[fact.factType].toLowerCase()}
                {fact.factType === "transaction_datetime" && " (YYYY-MM-DDTHH:mm, India time)"}
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id={`correct-${fact.factId}`}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="off"
                  maxLength={200}
                />
                <Button type="submit" size="sm" disabled={busy !== null || !value.trim()}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The extracted value is kept alongside your correction. Never enter OTPs, PINs or card numbers.
              </p>
            </form>
          )}
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          This comes from the case form. To change it, edit the case details (for example the transaction reference on the
          Overview tab).
        </p>
      )}
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ */
/* Conflict                                                            */
/* ------------------------------------------------------------------ */

function ConflictDetail({ incidentId, conflict, onSelect, onGraph }: PanelProps & { conflict: GraphConflict }) {
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (factId: string, body: FactReviewBody, label: string) => {
    setBusy(label)
    try {
      onGraph(await evidenceGraphService.review(incidentId, factId, body))
    } finally {
      setBusy(null)
    }
  }
  const anchor = conflict.sides[0].factId
  return (
    <PanelShell kicker="Conflict" title={FACT_TYPE_LABELS[conflict.factType]} onClose={() => onSelect(undefined)}>
      <div className="grid grid-cols-2 gap-2">
        {conflict.sides.map((s, i) => (
          <div key={s.factId} className="space-y-1.5 rounded-md border p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase">Value {i + 1}</p>
            <p className="font-semibold break-words">{s.displayValue}</p>
            <p className="text-xs break-words text-muted-foreground">
              {s.sourceLabel}
              {s.sourceLocation && ` · ${s.sourceLocation}`}
            </p>
            <Button size="xs" variant="ghost" className="-ml-1.5" onClick={() => onSelect(`fact:${s.factId}`)}>
              Open fact
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm">{conflict.explanation}</p>
      {conflict.uncertainty && <p className="text-sm text-muted-foreground italic">{conflict.uncertainty}</p>}
      <p className="text-xs text-muted-foreground">
        STOPLOSS AI never decides which value is right. Check the original files or ask your bank, then confirm or correct the
        right fact, or reject a misread one.
      </p>
      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        {conflict.reviewStatus !== "reviewed" && (
          <Button
            size="sm"
            onClick={() => act(anchor, { action: "review_conflict", matchId: conflict.matchId }, "review")}
            disabled={busy !== null}
          >
            {busy === "review" ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            Mark as reviewed
          </Button>
        )}
        {conflict.reviewStatus === "open" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => act(anchor, { action: "defer_conflict", matchId: conflict.matchId }, "defer")}
            disabled={busy !== null}
          >
            Decide later
          </Button>
        )}
        {conflict.reviewStatus !== "open" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act(anchor, { action: "reopen_conflict", matchId: conflict.matchId }, "reopen")}
            disabled={busy !== null}
          >
            <RotateCcw aria-hidden />
            Reopen
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Status:{" "}
        <span className="font-medium text-foreground">
          {conflict.reviewStatus === "open" ? "Open" : conflict.reviewStatus === "deferred" ? "Deferred" : "Reviewed by you"}
        </span>
      </p>
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ */
/* Transaction and evidence                                            */
/* ------------------------------------------------------------------ */

function TransactionDetail({ graph, tx, onSelect }: PanelProps & { tx: TransactionNode }) {
  const facts = graph.nodes.filter(
    (n): n is FactNode => n.type === "fact" && n.transactionId === tx.transactionId && n.recordRole === "transaction",
  )
  const evidence = new Map(graph.nodes.filter((n): n is EvidenceNode => n.type === "evidence").map((e) => [e.id, e]))
  const sources = [...new Set(facts.map((f) => f.evidenceNodeId))]
  const context = graph.edges.filter((e) => e.relation === "related_context" && e.target === tx.id)
  const missing = graph.missingEvidence.filter((m) => m.transactionId === tx.transactionId)
  const conflicts = graph.conflicts.filter((c) => c.transactionId === tx.transactionId)
  return (
    <PanelShell kicker="Transaction" title={tx.label} onClose={() => onSelect(undefined)}>
      <div className="space-y-1">
        <TransactionStatusBadge status={tx.status} />
        <p className="text-xs text-muted-foreground">{TRANSACTION_STATUS_LABELS[tx.status].description}</p>
      </div>
      <dl className="grid gap-3">
        <Row label="Described by">
          <ul className="space-y-1">
            {sources.map((id) => (
              <li key={id}>
                <button type="button" className="text-left text-primary hover:underline" onClick={() => onSelect(id)}>
                  {evidence.get(id)?.label ?? "Case details"}
                </button>
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Independent sources">{tx.sourceCount}</Row>
        {context.length > 0 && <Row label="Linked conversation mentions">{context.length}</Row>}
      </dl>
      {conflicts.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Conflicts</h5>
          {conflicts.map((c) => (
            <Button
              key={c.matchId}
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(conflictSelection(c.matchId))}
            >
              <Scale aria-hidden />
              {FACT_TYPE_LABELS[c.factType]}
              {c.reviewStatus !== "open" && <span className="text-muted-foreground">({c.reviewStatus})</span>}
            </Button>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Still missing</h5>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {missing.map((m) => (
              <li key={m.id}>{m.detail}</li>
            ))}
          </ul>
        </div>
      )}
    </PanelShell>
  )
}

function EvidenceDetail({ node, onSelect, onShowEvidence }: PanelProps & { node: EvidenceNode }) {
  return (
    <PanelShell kicker="Evidence" title={node.label} onClose={() => onSelect(undefined)}>
      <ProcessingBadge status={node.processingStatus} />
      {node.processingError && <p className="text-sm text-muted-foreground">{node.processingError}</p>}
      <dl className="grid grid-cols-2 gap-3">
        <Row label="Kind">{node.sourceType ? SOURCE_TYPE_LABELS[node.sourceType] : "Not yet known"}</Row>
        {node.mimeType && <Row label="File type">{node.mimeType}</Row>}
        {node.size !== undefined && <Row label="Size">{formatFileSize(node.size)}</Row>}
        {node.addedAt && <Row label="Added">{formatDateTime(node.addedAt)}</Row>}
        <Row label="Facts">{node.factCount}</Row>
        <Row label="Matches">{node.matchCount}</Row>
        <Row label="To review">{node.issueCount}</Row>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onShowEvidence(node.id)}>
          <Filter aria-hidden />
          Show only this source
        </Button>
        {node.evidenceId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              document.getElementById(`source-card-${node.evidenceId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            Go to its card
          </Button>
        )}
      </div>
    </PanelShell>
  )
}
