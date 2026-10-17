"use client"

import { Component, useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FACT_STATUS_LABELS, PROCESSING_LABELS, RELATION_LABELS } from "@/lib/evidence/labels"
import { type Box, layoutGraph } from "@/lib/evidence/layout"
import type { EdgeRelation, GraphEdge, GraphNode } from "@/lib/evidence/types"
import { cn } from "@/lib/utils"

import { edgeStyle, EvidenceIcon, FACT_STATUS_META, TransactionStatusBadge } from "./meta"

const MIN_SCALE = 0.4
const MAX_SCALE = 1.6

/**
 * Interactive evidence graph: SVG for edges, real buttons for nodes (focusable, labelled,
 * operable by keyboard). Positions come from the deterministic layout, so the picture never
 * shuffles between renders. Zoom with the controls; pan by scrolling.
 */
export function EvidenceGraphCanvas({
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
  const layout = useMemo(() => layoutGraph(nodes, edges), [nodes, edges])
  const viewport = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [fit, setFit] = useState(1)

  // Fit-to-width follows the container size; manual zoom overrides it until "Fit" is pressed.
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const update = () => setFit(Math.max(MIN_SCALE, Math.min(1, (el.clientWidth - 2) / layout.width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.width])

  const z = scale ?? fit
  const zoom = (delta: number) => setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((z + delta) * 10) / 10)))

  const connected = useMemo(() => {
    if (!selectedId) return undefined
    const ids = new Set([selectedId])
    for (const e of edges) if (e.source === selectedId || e.target === selectedId) ids.add(e.source).add(e.target)
    return ids
  }, [edges, selectedId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <span className="mr-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {Math.round(z * 100)}%
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => zoom(-0.1)} aria-label="Zoom out" disabled={z <= MIN_SCALE}>
          <Minus aria-hidden />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => zoom(0.1)} aria-label="Zoom in" disabled={z >= MAX_SCALE}>
          <Plus aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setScale(null)} aria-label="Fit graph to view">
          <Maximize2 aria-hidden />
          Fit
        </Button>
      </div>
      <div
        ref={viewport}
        className="relative max-h-[640px] overflow-auto rounded-lg border bg-muted/20"
        role="group"
        aria-label="Evidence graph. Use Tab to move between nodes and Enter to see details."
      >
        <div style={{ width: layout.width * z, height: layout.height * z }}>
          <div
            className="relative"
            style={{ width: layout.width, height: layout.height, transform: `scale(${z})`, transformOrigin: "0 0" }}
          >
            <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden>
              <defs>
                <marker
                  id="ei-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
                </marker>
              </defs>
              {edges.map((e) => {
                const a = layout.boxes.get(e.source)
                const b = layout.boxes.get(e.target)
                if (!a || !b) return null
                const dim = connected && !(connected.has(e.source) && connected.has(e.target))
                return <EdgePath key={e.id} edge={e} a={a} b={b} dim={Boolean(dim)} />
              })}
            </svg>
            {nodes.map((n) => {
              const box = layout.boxes.get(n.id)
              if (!box) return null
              return (
                <NodeButton
                  key={n.id}
                  node={n}
                  box={box}
                  selected={n.id === selectedId}
                  dim={Boolean(connected && !connected.has(n.id))}
                  onSelect={() => onSelect(n.id)}
                />
              )
            })}
          </div>
        </div>
      </div>
      <GraphLegend />
    </div>
  )
}

function EdgePath({ edge, a, b, dim }: { edge: GraphEdge; a: Box; b: Box; dim: boolean }) {
  const style = edgeStyle(edge.relation, edge.outcome)
  let d: string
  let mid: { x: number; y: number }
  const ay = a.y + a.height / 2
  const by = b.y + b.height / 2
  if (edge.relation === "extracted_from") {
    // Drawn evidence → fact (left to right), the direction the information flows.
    const x1 = b.x + b.width
    const x2 = a.x
    d = `M${x1},${by} C${x1 + 40},${by} ${x2 - 40},${ay} ${x2},${ay}`
    mid = { x: (x1 + x2) / 2, y: (ay + by) / 2 }
  } else if (Math.abs(a.x - b.x) < 1) {
    // Fact ↔ fact in the same column: an arc into the gap on the right.
    const x = a.x + a.width
    const bulge = Math.min(60, 18 + Math.abs(by - ay) * 0.12)
    d = `M${x},${ay} C${x + bulge},${ay} ${x + bulge},${by} ${x},${by}`
    mid = { x: x + bulge * 0.75, y: (ay + by) / 2 }
  } else {
    const x1 = a.x + a.width
    const x2 = b.x
    d = `M${x1},${ay} C${x1 + 40},${ay} ${x2 - 40},${by} ${x2},${by}`
    mid = { x: (x1 + x2) / 2, y: (ay + by) / 2 }
  }
  const arrow = edge.relation === "extracted_from" || edge.relation === "supports" || edge.relation === "related_context"
  return (
    <g opacity={dim ? 0.18 : edge.relation === "extracted_from" ? 0.55 : 0.95}>
      <path
        d={d}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        markerEnd={arrow ? "url(#ei-arrow)" : undefined}
      />
      {style.glyph && (
        <g transform={`translate(${mid.x},${mid.y})`}>
          <circle r="8" fill="var(--card)" stroke={style.stroke} strokeWidth="1" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="600" fill={style.stroke}>
            {style.glyph}
          </text>
        </g>
      )}
    </g>
  )
}

function NodeButton({
  node,
  box,
  selected,
  dim,
  onSelect,
}: {
  node: GraphNode
  box: Box
  selected: boolean
  dim: boolean
  onSelect: () => void
}) {
  const common = cn(
    "absolute flex flex-col justify-center overflow-hidden rounded-lg border bg-card px-2.5 text-left shadow-xs transition-[opacity,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    selected && "ring-2 ring-primary",
    dim && "opacity-40",
  )
  const style = { left: box.x, top: box.y, width: box.width, height: box.height }

  if (node.type === "evidence") {
    return (
      <button
        type="button"
        className={cn(common, "border-l-4 border-l-primary/60")}
        style={style}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Evidence: ${node.label}. ${PROCESSING_LABELS[node.processingStatus]}. ${node.factCount} facts.`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <EvidenceIcon sourceType={node.sourceType} kind={node.kind} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.label}</span>
        </span>
        <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {PROCESSING_LABELS[node.processingStatus]} · {node.factCount} {node.factCount === 1 ? "fact" : "facts"}
          {node.issueCount > 0 && ` · ${node.issueCount} to review`}
        </span>
      </button>
    )
  }

  if (node.type === "fact") {
    const meta = FACT_STATUS_META[node.displayStatus]
    const StatusIcon = meta.icon
    const tone =
      node.displayStatus === "conflicted"
        ? "border-destructive/50"
        : node.displayStatus === "user_confirmed"
          ? "border-success/50"
          : node.displayStatus === "needs_verification"
            ? "border-warning/50"
            : node.displayStatus === "user_rejected"
              ? "border-dashed opacity-70"
              : ""
    return (
      <button
        type="button"
        className={cn(common, tone, node.recordRole === "context" && "bg-info/5")}
        style={style}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${node.label}: ${node.displayValue}. ${FACT_STATUS_LABELS[node.displayStatus]}.`}
      >
        <span className="flex items-center justify-between gap-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          <span className="truncate">{node.label}</span>
          <StatusIcon aria-hidden className={cn("size-3.5 shrink-0", toneText(meta.tone))} />
        </span>
        <span
          className={cn(
            "truncate text-sm font-medium",
            node.factType === "transaction_reference" && "font-mono",
            node.displayStatus === "user_rejected" && "line-through",
          )}
        >
          {node.displayValue}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(common, "gap-1 border-2 border-primary/40 bg-primary/5")}
      style={style}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Transaction ${node.label}. ${node.status.replace("_", " ")}. ${node.sourceCount} independent sources.`}
    >
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Transaction</span>
      <span className="truncate text-sm font-semibold">{node.label}</span>
      <span className="flex items-center gap-1.5">
        <TransactionStatusBadge status={node.status} className="h-5 px-2 text-[10px]" />
        <span className="text-[11px] text-muted-foreground">
          {node.sourceCount} {node.sourceCount === 1 ? "source" : "sources"}
        </span>
      </span>
    </button>
  )
}

const toneText = (tone: string) =>
  ({ success: "text-success", danger: "text-destructive", warning: "text-warning", info: "text-info" })[tone] ??
  "text-muted-foreground"

const LEGEND: EdgeRelation[] = [
  "extracted_from",
  "supports",
  "corroborates",
  "conflicts_with",
  "possibly_same_transaction",
  "related_context",
]

function GraphLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
      {LEGEND.map((r) => {
        const s = edgeStyle(r)
        return (
          <li key={r} className="flex items-center gap-1.5">
            <svg width="28" height="10" aria-hidden>
              <line x1="0" y1="5" x2="28" y2="5" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
            </svg>
            {s.glyph && <span className="font-semibold">{s.glyph}</span>}
            {RELATION_LABELS[r]}
          </li>
        )
      })}
      <li className="flex items-center gap-1.5">
        <svg width="28" height="10" aria-hidden>
          <line x1="0" y1="5" x2="28" y2="5" stroke="var(--success)" strokeWidth="2" strokeDasharray="6 3" />
        </svg>
        <span className="font-semibold">≈</span>
        Partial match
      </li>
    </ul>
  )
}

/** Shows the list view, with a note, if drawing the graph throws. */
export class GraphErrorBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Only the error type: never node labels, which contain case data.
    console.error("[evidence-graph] render failed:", error instanceof Error ? error.name : "unknown")
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
