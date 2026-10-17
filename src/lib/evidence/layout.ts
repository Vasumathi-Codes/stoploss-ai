/**
 * Deterministic three-column layout: evidence (left) → facts (middle) → transactions (right).
 *
 * Facts are grouped by transaction, then by fact type, so facts that corroborate or conflict
 * sit next to each other and their edges stay short. Evidence and transaction nodes are placed
 * level with the facts they connect to, then pushed down just enough not to overlap. No forces,
 * no randomness: the same graph always gets the same positions.
 */
import { FACT_TYPE_ORDER } from "./labels"
import type { EvidenceNode, FactNode, GraphEdge, GraphNode, TransactionNode } from "./types"

export const LAYOUT = {
  padding: 24,
  columnX: [24, 324, 660],
  width: [236, 268, 248],
  height: { evidence: 66, fact: 54, transaction: 82 },
  gap: 12,
  groupGap: 30,
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  width: number
  height: number
  boxes: Map<string, Box>
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const evidence = nodes.filter((n): n is EvidenceNode => n.type === "evidence")
  const facts = nodes.filter((n): n is FactNode => n.type === "fact")
  const txs = nodes.filter((n): n is TransactionNode => n.type === "transaction")
  const evidenceOrder = new Map(evidence.map((n, i) => [n.id, i]))
  const txOrder = new Map(txs.map((n, i) => [n.transactionId, i]))
  const typeOrder = (f: FactNode) => FACT_TYPE_ORDER.indexOf(f.factType)

  // Group: each transaction in order, then context facts, then anything unattached (e.g. rejected).
  const groupOf = (f: FactNode) =>
    f.transactionId !== undefined && txOrder.has(f.transactionId) && f.recordRole === "transaction"
      ? txOrder.get(f.transactionId)!
      : f.recordRole === "context"
        ? txs.length
        : txs.length + 1
  const ordered = [...facts].sort(
    (a, b) =>
      groupOf(a) - groupOf(b) ||
      (groupOf(a) === txs.length
        ? (evidenceOrder.get(a.evidenceNodeId) ?? 0) - (evidenceOrder.get(b.evidenceNodeId) ?? 0) || cmp(a.factId, b.factId)
        : typeOrder(a) - typeOrder(b) ||
          (evidenceOrder.get(a.evidenceNodeId) ?? 0) - (evidenceOrder.get(b.evidenceNodeId) ?? 0)) ||
      cmp(a.id, b.id),
  )

  const boxes = new Map<string, Box>()
  let y = LAYOUT.padding
  let lastGroup: number | undefined
  for (const f of ordered) {
    const g = groupOf(f)
    if (lastGroup !== undefined && g !== lastGroup) y += LAYOUT.groupGap
    lastGroup = g
    boxes.set(f.id, { x: LAYOUT.columnX[1], y, width: LAYOUT.width[1], height: LAYOUT.height.fact })
    y += LAYOUT.height.fact + LAYOUT.gap
  }

  const centerOf = (ids: string[]) => {
    const ys = ids
      .map((id) => boxes.get(id))
      .filter((b): b is Box => Boolean(b))
      .map((b) => b.y + b.height / 2)
    return ys.length > 0 ? ys.reduce((s, v) => s + v, 0) / ys.length : Number.POSITIVE_INFINITY
  }

  const place = (column: number, items: { id: string; desired: number; height: number }[]) => {
    let bottom = LAYOUT.padding - LAYOUT.gap
    // Stable: ties keep their original order.
    const sorted = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.desired - b.desired || a.i - b.i)
    for (const it of sorted) {
      const top = Number.isFinite(it.desired) ? Math.max(it.desired - it.height / 2, bottom + LAYOUT.gap) : bottom + LAYOUT.gap
      boxes.set(it.id, { x: LAYOUT.columnX[column], y: top, width: LAYOUT.width[column], height: it.height })
      bottom = top + it.height
    }
  }

  const factsOfEvidence = new Map<string, string[]>()
  const factsOfTx = new Map<string, string[]>()
  for (const e of edges) {
    if (e.relation === "extracted_from")
      (factsOfEvidence.get(e.target) ?? factsOfEvidence.set(e.target, []).get(e.target)!).push(e.source)
    if (e.relation === "supports") (factsOfTx.get(e.target) ?? factsOfTx.set(e.target, []).get(e.target)!).push(e.source)
  }
  place(
    0,
    evidence.map((n) => ({ id: n.id, desired: centerOf(factsOfEvidence.get(n.id) ?? []), height: LAYOUT.height.evidence })),
  )
  place(
    2,
    txs.map((n) => ({ id: n.id, desired: centerOf(factsOfTx.get(n.id) ?? []), height: LAYOUT.height.transaction })),
  )

  let maxBottom = 0
  for (const b of boxes.values()) maxBottom = Math.max(maxBottom, b.y + b.height)
  return {
    width: LAYOUT.columnX[2] + LAYOUT.width[2] + LAYOUT.padding,
    height: Math.max(maxBottom + LAYOUT.padding, 200),
    boxes,
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
