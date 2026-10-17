/**
 * Builds the Evidence Intelligence graph from persisted records. Pure and deterministic:
 * the same rows always give the same nodes, edges and ids, so the graph can be rebuilt on
 * every request instead of being stored.
 */
import type { Currency, EvidenceKind } from "@/types"

import { FACT_TYPE_LABELS, FACT_TYPE_ORDER, SOURCE_TYPE_LABELS } from "./labels"
import { describeValue, type RuleId } from "./matching"
import { normalizeForType } from "./normalize"
import {
  type EngineFact,
  type EvidenceGraph,
  type EvidenceNode,
  type EvidenceRelation,
  type ExtractionMethod,
  type FactNode,
  type FactReviewStatus,
  type FactType,
  type GraphConflict,
  type GraphEdge,
  type GraphNode,
  GRAPH_SCHEMA_VERSION,
  type MatchOutcome,
  type MatchReviewStatus,
  type MissingItem,
  type ProcessingStatus,
  type RecordRole,
  type SourceType,
  type TimePrecision,
  type TransactionNode,
  type TransactionStatus,
} from "./types"

export interface GraphEvidenceInput {
  id: string
  name: string
  kind: EvidenceKind
  mimeType: string
  size: number
  addedAt: string
  processingStatus: ProcessingStatus
  processingError: string | null
}

export interface GraphFactInput {
  id: string
  evidenceId: string | null
  transactionId: string | null
  factKey: string
  recordKey: string
  recordRole: RecordRole
  factType: FactType
  sourceType: SourceType
  extractionMethod: ExtractionMethod
  extractorVersion: string | null
  rawValue: string
  normalizedValue: string
  correctedValue: string | null
  amountMinor: number | null
  currency: Currency | null
  occurredAt: string | null
  timePrecision: TimePrecision | null
  sourceLocation: string | null
  reviewStatus: FactReviewStatus
  updatedAt: string
}

export interface GraphCandidateInput {
  id: string
  candidateKey: string
}

export interface GraphMatchInput {
  id: string
  ruleId: string
  outcome: MatchOutcome
  relation: EvidenceRelation
  factAId: string
  factBId: string
  transactionId: string | null
  explanation: string
  uncertainty: string | null
  requiresReview: boolean
  reviewStatus: MatchReviewStatus
}

export interface GraphInput {
  caseId: string
  generatedAt: string
  evidence: GraphEvidenceInput[]
  facts: GraphFactInput[]
  candidates: GraphCandidateInput[]
  matches: GraphMatchInput[]
}

interface TxMeta {
  label: string
  sources: number
  status: TransactionStatus
  facts: GraphFactInput[]
  agreeing: number
}

export const CASE_NODE_ID = "evidence:case"
export const evidenceNodeId = (evidenceId: string | null) => (evidenceId ? `evidence:${evidenceId}` : CASE_NODE_ID)
export const factNodeId = (factId: string) => `fact:${factId}`
export const txNodeId = (transactionId: string) => `tx:${transactionId}`

/** The values matching uses: a person's correction replaces the extracted value. */
export function toEngineFact(f: GraphFactInput): EngineFact {
  const corrected =
    f.reviewStatus === "user_corrected" && f.correctedValue
      ? normalizeForType(f.factType, f.correctedValue, f.currency ?? "INR")
      : undefined
  return {
    id: f.id,
    factKey: f.factKey,
    recordKey: f.recordKey,
    recordRole: f.recordRole,
    evidenceId: f.evidenceId,
    sourceType: f.sourceType,
    factType: f.factType,
    reviewStatus: f.reviewStatus,
    normalizedValue: corrected?.normalizedValue ?? f.normalizedValue,
    amountMinor: corrected?.amountMinor ?? f.amountMinor ?? undefined,
    currency: corrected?.currency ?? f.currency ?? undefined,
    occurredAt: corrected?.occurredAt ? Date.parse(corrected.occurredAt) : f.occurredAt ? Date.parse(f.occurredAt) : undefined,
    timePrecision: corrected?.timePrecision ?? f.timePrecision ?? undefined,
  }
}

const isConflict = (m: GraphMatchInput) => m.outcome === "conflict" && m.relation === "conflicts_with"
const isOpen = (m: GraphMatchInput) => m.reviewStatus !== "reviewed"

function displayValue(f: GraphFactInput, engine: EngineFact) {
  if (f.factType === "message_event" || f.factType === "transaction_status" || f.factType === "other") return f.rawValue
  if (f.factType === "transaction_direction")
    return engine.normalizedValue === "debit" ? "Money sent (debit)" : "Money received (credit)"
  if (f.factType === "payment_method")
    return f.correctedValue && f.reviewStatus === "user_corrected" ? f.correctedValue : f.rawValue
  return describeValue(engine)
}

function sourceTypeForKind(kind: EvidenceKind): SourceType | undefined {
  if (kind === "pdf") return "bank_statement"
  if (kind === "text") return "chat_export"
  return undefined
}

export function buildEvidenceGraph(input: GraphInput): EvidenceGraph {
  const { evidence, candidates, matches } = input
  const facts = [...input.facts].sort((a, b) => (a.factKey < b.factKey ? -1 : a.factKey > b.factKey ? 1 : 0))
  const engine = new Map(facts.map((f) => [f.id, toEngineFact(f)]))
  const factById = new Map(facts.map((f) => [f.id, f]))
  const candidateIds = new Set(candidates.map((c) => c.id))

  // Only matches whose facts still exist (deleted evidence cascades, but be defensive).
  const liveMatches = matches.filter((m) => factById.has(m.factAId) && factById.has(m.factBId))
  const openConflictFacts = new Set(liveMatches.filter((m) => isConflict(m) && isOpen(m)).flatMap((m) => [m.factAId, m.factBId]))

  /* ---------------- Transactions ---------------- */
  const txFacts = new Map<string, GraphFactInput[]>()
  for (const f of facts) {
    if (!f.transactionId || !candidateIds.has(f.transactionId) || f.reviewStatus === "user_rejected") continue
    const list = txFacts.get(f.transactionId)
    if (list) list.push(f)
    else txFacts.set(f.transactionId, [f])
  }

  const txNodes: TransactionNode[] = []
  const txMeta = new Map<string, TxMeta>()
  const orderedCandidates = [...candidates].sort((a, b) => (a.candidateKey < b.candidateKey ? -1 : 1))
  for (const [index, c] of orderedCandidates.entries()) {
    const list = txFacts.get(c.id) ?? []
    if (list.length === 0) continue
    const evidenceFacts = list.filter((f) => f.sourceType !== "case_details")
    const pick = (t: FactType) => evidenceFacts.find((f) => f.factType === t) ?? list.find((f) => f.factType === t)
    const parts = [pick("amount"), pick("transaction_datetime"), pick("transaction_reference")]
      .filter((f): f is GraphFactInput => Boolean(f))
      .map((f) =>
        f.factType === "transaction_reference" ? `ref ${describeValue(engine.get(f.id)!)}` : describeValue(engine.get(f.id)!),
      )
    const label = parts.length > 0 ? parts.join(" · ") : `Transaction ${index + 1}`

    // Independent sources: evidence items, with suspected duplicates merged, the case form excluded.
    const groups = new Map<string, string>()
    for (const f of evidenceFacts) groups.set(f.recordKey, f.evidenceId ?? f.recordKey)
    const txMatches = liveMatches.filter((m) => m.transactionId === c.id)
    for (const m of txMatches.filter((x) => x.ruleId === "source.possible_duplicate")) {
      const a = factById.get(m.factAId)!
      const b = factById.get(m.factBId)!
      groups.set(b.recordKey, groups.get(a.recordKey) ?? a.recordKey)
    }
    const sources = new Set(groups.values()).size
    const agreeing = new Set<FactType>()
    for (const m of txMatches) {
      if (m.outcome !== "match" || m.relation !== "corroborates") continue
      const a = factById.get(m.factAId)!
      const b = factById.get(m.factBId)!
      if (a.sourceType === "case_details" || b.sourceType === "case_details") continue
      if (groups.get(a.recordKey) !== groups.get(b.recordKey)) agreeing.add(a.factType)
    }
    const openConflicts = txMatches.filter((m) => isConflict(m) && isOpen(m)).length
    const corroborated =
      sources >= 2 && (agreeing.has("transaction_reference") || (agreeing.has("amount") && agreeing.has("transaction_datetime")))
    const status: TransactionStatus =
      openConflicts > 0
        ? "conflicted"
        : evidenceFacts.length === 0
          ? "reported_only"
          : corroborated
            ? "corroborated"
            : "single_source"

    txMeta.set(c.id, { label, sources, status, facts: list, agreeing: agreeing.size })
    txNodes.push({
      id: txNodeId(c.id),
      type: "transaction",
      transactionId: c.id,
      label,
      status,
      sourceCount: sources,
      factCount: list.length,
      openConflicts,
    })
  }

  /* ---------------- Facts ---------------- */
  const factNodes: FactNode[] = facts.map((f) => {
    const e = engine.get(f.id)!
    return {
      id: factNodeId(f.id),
      type: "fact",
      factId: f.id,
      factType: f.factType,
      label: FACT_TYPE_LABELS[f.factType],
      displayValue: displayValue(f, e),
      rawValue: f.rawValue,
      normalizedValue: f.normalizedValue,
      correctedValue: f.correctedValue ?? undefined,
      evidenceId: f.evidenceId,
      evidenceNodeId: evidenceNodeId(f.evidenceId),
      transactionId: f.transactionId && txMeta.has(f.transactionId) ? f.transactionId : undefined,
      recordRole: f.recordRole,
      sourceType: f.sourceType,
      sourceLocation: f.sourceLocation ?? undefined,
      extractionMethod: f.extractionMethod,
      extractorVersion: f.extractorVersion ?? undefined,
      reviewStatus: f.reviewStatus,
      displayStatus: openConflictFacts.has(f.id) && f.reviewStatus !== "user_rejected" ? "conflicted" : f.reviewStatus,
      userConfirmed: f.reviewStatus === "user_confirmed" || f.reviewStatus === "user_corrected",
      reviewable: f.sourceType !== "case_details",
      updatedAt: f.updatedAt,
    }
  })

  /* ---------------- Evidence ---------------- */
  const factsByEvidence = new Map<string, GraphFactInput[]>()
  for (const f of facts) {
    const key = evidenceNodeId(f.evidenceId)
    const list = factsByEvidence.get(key)
    if (list) list.push(f)
    else factsByEvidence.set(key, [f])
  }
  const counts = (nodeId: string) => {
    const ids = new Set((factsByEvidence.get(nodeId) ?? []).map((f) => f.id))
    const touching = liveMatches.filter((m) => ids.has(m.factAId) || ids.has(m.factBId))
    return {
      factCount: ids.size,
      matchCount: touching.filter((m) => m.outcome === "match" || m.outcome === "partial_match").length,
      issueCount:
        touching.filter((m) => isConflict(m) && isOpen(m)).length +
        [...ids].filter((id) => factById.get(id)!.reviewStatus === "needs_verification").length,
    }
  }
  const evidenceNodes: EvidenceNode[] = [...evidence]
    .sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : a.id < b.id ? -1 : 1))
    .map((e) => {
      const id = evidenceNodeId(e.id)
      const own = factsByEvidence.get(id) ?? []
      return {
        id,
        type: "evidence",
        label: e.name,
        evidenceId: e.id,
        sourceType:
          own.find((f) => f.recordRole === "transaction")?.sourceType ?? own[0]?.sourceType ?? sourceTypeForKind(e.kind),
        kind: e.kind,
        mimeType: e.mimeType,
        size: e.size,
        addedAt: e.addedAt,
        processingStatus: e.processingStatus,
        processingError: e.processingError ?? undefined,
        ...counts(id),
      }
    })
  if (factsByEvidence.has(CASE_NODE_ID)) {
    evidenceNodes.unshift({
      id: CASE_NODE_ID,
      type: "evidence",
      label: SOURCE_TYPE_LABELS.case_details,
      evidenceId: null,
      sourceType: "case_details",
      processingStatus: "processed",
      ...counts(CASE_NODE_ID),
    })
  }

  /* ---------------- Edges ---------------- */
  const nodeIds = new Set<string>([...evidenceNodes, ...factNodes, ...txNodes].map((n) => n.id))
  const edges: GraphEdge[] = []
  for (const f of facts) {
    const fid = factNodeId(f.id)
    edges.push({
      id: `extracted_from:${f.id}`,
      source: fid,
      target: evidenceNodeId(f.evidenceId),
      relation: "extracted_from",
      explanation: f.sourceLocation ? `Found in ${f.sourceLocation}.` : "Found in this source.",
      supportingFactIds: [f.id],
      requiresReview: false,
    })
    if (f.transactionId && txMeta.has(f.transactionId) && f.recordRole === "transaction" && f.reviewStatus !== "user_rejected") {
      edges.push({
        id: `supports:${f.id}`,
        source: fid,
        target: txNodeId(f.transactionId),
        relation: "supports",
        explanation: "This fact is part of the record that describes this transaction.",
        supportingFactIds: [f.id],
        requiresReview: false,
      })
    }
  }
  for (const m of liveMatches) {
    const b = factById.get(m.factBId)!
    // Context is drawn to the transaction itself, which is what the chat relates to.
    const target =
      m.relation === "related_context" && b.transactionId && txMeta.has(b.transactionId)
        ? txNodeId(b.transactionId)
        : factNodeId(m.factBId)
    edges.push({
      id: `match:${m.id}`,
      source: factNodeId(m.factAId),
      target,
      relation: m.relation,
      ruleId: m.ruleId,
      outcome: m.outcome,
      matchId: m.id,
      explanation: m.explanation,
      uncertainty: m.uncertainty ?? undefined,
      supportingFactIds: [m.factAId, m.factBId],
      reviewStatus: m.reviewStatus,
      requiresReview: m.requiresReview,
    })
  }
  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  /* ---------------- Conflicts ---------------- */
  const sourceLabel = (f: GraphFactInput) =>
    f.evidenceId
      ? (evidence.find((e) => e.id === f.evidenceId)?.name ?? SOURCE_TYPE_LABELS[f.sourceType])
      : SOURCE_TYPE_LABELS.case_details
  const side = (id: string) => {
    const f = factById.get(id)!
    return {
      factId: f.id,
      displayValue: displayValue(f, engine.get(f.id)!),
      rawValue: f.rawValue,
      sourceLabel: sourceLabel(f),
      evidenceId: f.evidenceId,
      sourceLocation: f.sourceLocation ?? undefined,
    }
  }
  const conflicts: GraphConflict[] = liveMatches.filter(isConflict).map((m) => ({
    matchId: m.id,
    ruleId: m.ruleId,
    factType: factById.get(m.factAId)!.factType,
    transactionId: m.transactionId ?? undefined,
    explanation: m.explanation,
    uncertainty: m.uncertainty ?? undefined,
    reviewStatus: m.reviewStatus,
    sides: [side(m.factAId), side(m.factBId)],
  }))

  /* ---------------- Missing information ---------------- */
  const missingEvidence = buildMissing(evidence, facts, txMeta)

  const nodes: GraphNode[] = [...evidenceNodes, ...factNodes, ...txNodes]
  const processed = evidence.filter((e) => e.processingStatus === "processed" || e.processingStatus === "no_facts").length
  const failed = evidence.filter((e) => e.processingStatus === "failed").length
  const unsupported = evidence.filter((e) => e.processingStatus === "unsupported").length
  const notProcessed = evidence.length - processed - failed - unsupported

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    caseId: input.caseId,
    generatedAt: input.generatedAt,
    nodes,
    edges: validEdges,
    summary: {
      evidenceFiles: evidence.length,
      transactionCandidates: txNodes.length,
      // Distinct (transaction, fact type) pairs on which two independent evidence items agree exactly.
      corroboratedFacts: [...txMeta.values()].reduce((n, t) => n + t.agreeing, 0),
      openConflicts: conflicts.filter((c) => c.reviewStatus !== "reviewed").length,
      missingItems: missingEvidence.length,
      unreviewedFacts: facts.filter((f) => f.reviewStatus === "unreviewed" && f.sourceType !== "case_details").length,
      totalFacts: facts.length,
    },
    conflicts,
    missingEvidence,
    processingStatus: {
      state:
        evidence.length === 0 ? "empty" : processed === 0 ? "not_processed" : notProcessed + failed > 0 ? "partial" : "complete",
      processed,
      notProcessed,
      failed,
      unsupported,
    },
  }
}

function buildMissing(evidence: GraphEvidenceInput[], facts: GraphFactInput[], tx: Map<string, TxMeta>): MissingItem[] {
  const out: MissingItem[] = []
  if (evidence.length === 0) {
    out.push({
      id: "no-evidence",
      title: "No evidence added yet",
      detail: "Add payment screenshots, your bank SMS, a bank statement or the chat with the other party.",
      severity: "high",
    })
  }
  for (const e of evidence) {
    if (e.processingStatus === "not_processed") {
      const how =
        e.kind === "image"
          ? "Read its details"
          : e.kind === "pdf"
            ? "Read the statement"
            : e.kind === "text"
              ? "Read the chat"
              : undefined
      if (how)
        out.push({
          id: `unprocessed:${e.id}`,
          title: `${e.name} hasn't been analysed`,
          detail: `${how} to add its facts to the graph. Nothing is read without your go-ahead.`,
          severity: "normal",
          evidenceId: e.id,
        })
    } else if (e.processingStatus === "failed") {
      out.push({
        id: `failed:${e.id}`,
        title: `Couldn't analyse ${e.name}`,
        detail: e.processingError ?? "Processing failed. You can try again.",
        severity: "normal",
        evidenceId: e.id,
      })
    } else if (e.processingStatus === "unsupported") {
      out.push({
        id: `unsupported:${e.id}`,
        title: `${e.name} can't be analysed`,
        detail: e.processingError ?? "This file type isn't supported. It stays on record as evidence.",
        severity: "normal",
        evidenceId: e.id,
      })
    }
  }
  const sourceTypes = new Set(facts.map((f) => f.sourceType))
  for (const [id, t] of tx) {
    const has = (type: FactType) => t.facts.some((f) => f.factType === type)
    if (!has("transaction_reference"))
      out.push({
        id: `no-ref:${id}`,
        title: `No transaction reference for ${t.label}`,
        detail: "The UTR / RRN is in your bank SMS, statement or payment-app history. Banks use it to trace the payment.",
        severity: "high",
        transactionId: id,
      })
    if (t.sources < 2)
      out.push({
        id: `one-source:${id}`,
        title: t.sources === 0 ? `Only your report describes ${t.label}` : `Only one source describes ${t.label}`,
        detail:
          t.sources === 0
            ? "If this is a payment found in your evidence, add its transaction reference or recipient to the case so they link. Reported amounts and times are often estimates, so they aren't linked on their own."
            : "A bank statement or bank SMS showing the same payment would let the app cross-check it.",
        severity: "normal",
        transactionId: id,
      })
    if (!t.facts.some((f) => f.factType.startsWith("recipient_")))
      out.push({
        id: `no-recipient:${id}`,
        title: `Recipient not identified for ${t.label}`,
        detail: "The UPI ID, phone number or account the money went to is usually on the payment confirmation.",
        severity: "normal",
        transactionId: id,
      })
    const times = t.facts.filter((f) => f.factType === "transaction_datetime" && f.sourceType !== "case_details")
    if (times.length > 0 && times.every((f) => f.timePrecision === "day"))
      out.push({
        id: `no-time:${id}`,
        title: `Exact time not shown for ${t.label}`,
        detail: "The evidence shows only the date. Your bank SMS or payment app usually shows the exact time.",
        severity: "normal",
        transactionId: id,
      })
  }
  if (tx.size > 0 && !sourceTypes.has("bank_statement"))
    out.push({
      id: "no-statement",
      title: "No bank statement analysed",
      detail: "A statement from your bank is an independent record that can confirm the debit.",
      severity: "normal",
    })
  if (tx.size === 0 && facts.length > 0)
    out.push({
      id: "no-transaction",
      title: "No transaction identified yet",
      detail: "The facts found so far don't describe a payment. Add a payment confirmation, bank SMS or statement.",
      severity: "high",
    })
  return out
}

/* ------------------------------------------------------------------ */
/* Integrity and filtering                                             */
/* ------------------------------------------------------------------ */

/** Problems with a graph's structure; empty when it is consistent. */
export function graphIntegrityErrors(graph: Pick<EvidenceGraph, "nodes" | "edges">): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node ${n.id}`)
    ids.add(n.id)
  }
  const edgeIds = new Set<string>()
  const relations = new Set<string>()
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) errors.push(`duplicate edge ${e.id}`)
    edgeIds.add(e.id)
    if (!ids.has(e.source)) errors.push(`edge ${e.id} has missing source ${e.source}`)
    if (!ids.has(e.target)) errors.push(`edge ${e.id} has missing target ${e.target}`)
    const rel = `${e.relation}|${e.source}|${e.target}|${e.ruleId ?? ""}`
    if (relations.has(rel)) errors.push(`duplicate relationship ${rel}`)
    relations.add(rel)
  }
  return errors
}

export interface GraphFilter {
  sourceTypes: SourceType[]
  factTypes: FactType[]
  statuses: FactNode["displayStatus"][]
  /** Show only one evidence item and what it connects to. */
  evidenceNodeId?: string
}

export const EMPTY_FILTER: GraphFilter = { sourceTypes: [], factTypes: [], statuses: [] }

export const isFilterActive = (f: GraphFilter) =>
  f.sourceTypes.length > 0 || f.factTypes.length > 0 || f.statuses.length > 0 || Boolean(f.evidenceNodeId)

/**
 * Keeps fact nodes passing every active filter, the evidence and transactions they connect to,
 * and only edges whose both ends remain. Empty filter arrays mean "no restriction".
 */
export function filterGraph(graph: Pick<EvidenceGraph, "nodes" | "edges">, filter: GraphFilter) {
  const facts = graph.nodes.filter((n): n is FactNode => n.type === "fact")
  const keptFacts = facts.filter(
    (f) =>
      (filter.sourceTypes.length === 0 || filter.sourceTypes.includes(f.sourceType)) &&
      (filter.factTypes.length === 0 || filter.factTypes.includes(f.factType)) &&
      (filter.statuses.length === 0 || filter.statuses.includes(f.displayStatus)) &&
      (!filter.evidenceNodeId || f.evidenceNodeId === filter.evidenceNodeId),
  )
  const keep = new Set(keptFacts.map((f) => f.id))
  for (const e of graph.edges) {
    if (keep.has(e.source) && (e.relation === "extracted_from" || e.relation === "supports" || e.relation === "related_context"))
      keep.add(e.target)
  }
  const evidenceShown = (n: GraphNode) =>
    n.type === "evidence" &&
    (filter.evidenceNodeId
      ? n.id === filter.evidenceNodeId
      : filter.sourceTypes.length === 0 && filter.factTypes.length === 0 && filter.statuses.length === 0
        ? true
        : keep.has(n.id) || (n.sourceType !== undefined && filter.sourceTypes.includes(n.sourceType)))
  const nodes = graph.nodes.filter((n) => keep.has(n.id) || evidenceShown(n))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  return { nodes, edges }
}

export type { RuleId }
export { FACT_TYPE_ORDER }
