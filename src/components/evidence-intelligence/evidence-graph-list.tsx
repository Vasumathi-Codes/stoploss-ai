"use client"

import { ChevronRight } from "lucide-react"

import { RELATION_LABELS, SOURCE_TYPE_LABELS } from "@/lib/evidence/labels"
import type { EvidenceNode, FactNode, GraphEdge, GraphNode, TransactionNode } from "@/lib/evidence/types"
import { cn } from "@/lib/utils"

import { EvidenceIcon, FactStatusBadge, ProcessingBadge, TransactionStatusBadge } from "./meta"

/**
 * The graph as nested lists: transactions → their facts, then conversation context and the
 * evidence files. The accessible and narrow-screen alternative, and the fallback if the graph
 * can't be drawn. Shows the same nodes and relationships as the graph.
 */
export function EvidenceGraphList({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId?: string
  onSelect: (nodeId: string) => void
}) {
  const txs = nodes.filter((n): n is TransactionNode => n.type === "transaction")
  const facts = nodes.filter((n): n is FactNode => n.type === "fact")
  const evidence = nodes.filter((n): n is EvidenceNode => n.type === "evidence")
  const evidenceName = new Map(evidence.map((e) => [e.id, e.label]))
  const linksOf = (id: string) =>
    edges.filter((e) => (e.source === id || e.target === id) && e.relation !== "extracted_from" && e.relation !== "supports")

  const factItem = (f: FactNode) => {
    const links = linksOf(f.id)
    return (
      <li key={f.id}>
        <button
          type="button"
          onClick={() => onSelect(f.id)}
          aria-pressed={f.id === selectedId}
          className={cn(
            "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            f.id === selectedId && "bg-muted",
          )}
        >
          <span className="w-40 shrink-0 text-xs text-muted-foreground">{f.label}</span>
          <span className={cn("min-w-0 flex-1 truncate font-medium", f.factType === "transaction_reference" && "font-mono")}>
            {f.displayValue}
          </span>
          <span className="text-xs text-muted-foreground">
            from {evidenceName.get(f.evidenceNodeId) ?? SOURCE_TYPE_LABELS[f.sourceType]}
          </span>
          <FactStatusBadge status={f.displayStatus} className="h-5 text-[11px]" />
          {links.length > 0 && (
            <span className="w-full pl-40 text-xs text-muted-foreground">
              {[...new Set(links.map((l) => RELATION_LABELS[l.relation]))].join(" · ")}
            </span>
          )}
        </button>
      </li>
    )
  }

  const context = facts.filter((f) => f.recordRole === "context")
  const unattached = facts.filter((f) => f.recordRole === "transaction" && !f.transactionId)

  return (
    <div className="space-y-5">
      {txs.map((t) => (
        <section key={t.id} aria-labelledby={`${t.id}-h`} className="rounded-lg border">
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={t.id === selectedId}
            className={cn(
              "flex w-full flex-wrap items-center gap-2 rounded-t-lg border-b bg-muted/40 px-3 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              t.id === selectedId && "bg-muted",
            )}
          >
            <span id={`${t.id}-h`} className="mr-auto text-sm font-semibold">
              {t.label}
            </span>
            <TransactionStatusBadge status={t.status} />
            <span className="text-xs text-muted-foreground">
              {t.sourceCount} {t.sourceCount === 1 ? "source" : "sources"}
            </span>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </button>
          <ul className="p-1.5">
            {facts.filter((f) => f.transactionId === t.transactionId && f.recordRole === "transaction").map(factItem)}
          </ul>
        </section>
      ))}

      {context.length > 0 && (
        <section aria-labelledby="ei-context-h">
          <h4 id="ei-context-h" className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Mentioned in conversations (context)
          </h4>
          <ul className="rounded-lg border p-1.5">{context.map(factItem)}</ul>
        </section>
      )}

      {unattached.length > 0 && (
        <section aria-labelledby="ei-unattached-h">
          <h4 id="ei-unattached-h" className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Not part of a transaction
          </h4>
          <ul className="rounded-lg border p-1.5">{unattached.map(factItem)}</ul>
        </section>
      )}

      <section aria-labelledby="ei-sources-h">
        <h4 id="ei-sources-h" className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sources
        </h4>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {evidence.map((e) => {
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  aria-pressed={e.id === selectedId}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    e.id === selectedId && "bg-muted",
                  )}
                >
                  <EvidenceIcon sourceType={e.sourceType} kind={e.kind} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.factCount} facts</span>
                  <ProcessingBadge status={e.processingStatus} className="h-5 text-[11px]" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
