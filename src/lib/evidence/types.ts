/**
 * Evidence Intelligence domain types, shared by the browser and the server.
 *
 * String unions mirror the Prisma enums (prisma/schema.prisma) so rows map to these
 * types without translation, the same convention as `src/types`.
 */
import type { Currency, EvidenceKind } from "@/types"

export type FactType =
  | "amount"
  | "transaction_reference"
  | "transaction_datetime"
  | "recipient_upi_id"
  | "recipient_phone"
  | "recipient_account"
  | "recipient_name"
  | "payment_method"
  | "transaction_direction"
  | "transaction_status"
  | "message_event"
  | "other"

export type SourceType =
  "payment_screenshot" | "sms_notification" | "bank_statement" | "chat_export" | "case_details" | "other_document"

/** transaction: the record describes a payment. context: it only mentions one (a chat message). */
export type RecordRole = "transaction" | "context"

export type ExtractionMethod = "vision_model" | "statement_parser" | "chat_parser" | "user_entry"

export type TimePrecision = "minute" | "day"

/** The person's review of a fact. Never set by a model or by matching. */
export type FactReviewStatus = "unreviewed" | "user_confirmed" | "user_rejected" | "user_corrected" | "needs_verification"

/** What the UI shows: the stored review, or "conflicted" while an open conflict involves the fact. */
export type FactDisplayStatus = FactReviewStatus | "conflicted"

export type MatchOutcome = "match" | "partial_match" | "conflict" | "insufficient_evidence" | "unrelated"

export type EvidenceRelation = "corroborates" | "conflicts_with" | "possibly_same_transaction" | "related_context"

export type MatchReviewStatus = "open" | "reviewed" | "deferred"

export type ProcessingStatus = "not_processed" | "processed" | "no_facts" | "failed" | "unsupported"

/** A fact as an extractor produces it, before it is stored. Values are already screened. */
export interface ExtractedFact {
  factKey: string
  recordKey: string
  recordRole: RecordRole
  factType: FactType
  sourceType: SourceType
  extractionMethod: ExtractionMethod
  extractorVersion?: string
  rawValue: string
  normalizedValue: string
  amountMinor?: number
  currency?: Currency
  /** ISO 8601. */
  occurredAt?: string
  timePrecision?: TimePrecision
  sourceLocation?: string
}

/** What the matching engine needs from a stored fact. Values are the effective ones (a correction wins). */
export interface EngineFact {
  id: string
  factKey: string
  recordKey: string
  recordRole: RecordRole
  evidenceId: string | null
  sourceType: SourceType
  factType: FactType
  reviewStatus: FactReviewStatus
  normalizedValue: string
  amountMinor?: number
  currency?: Currency
  /** Epoch milliseconds. */
  occurredAt?: number
  timePrecision?: TimePrecision
}

/* ------------------------------------------------------------------ */
/* Graph API contract (GET /api/incidents/:id/evidence-graph)          */
/* ------------------------------------------------------------------ */

export const GRAPH_SCHEMA_VERSION = 1

export type TransactionStatus = "corroborated" | "conflicted" | "single_source" | "reported_only"

export interface EvidenceNode {
  id: string
  type: "evidence"
  label: string
  /** Null for the case-form node. */
  evidenceId: string | null
  /** Detected from extracted facts; falls back to the file kind. */
  sourceType?: SourceType
  kind?: EvidenceKind
  mimeType?: string
  size?: number
  addedAt?: string
  processingStatus: ProcessingStatus
  processingError?: string
  factCount: number
  matchCount: number
  issueCount: number
}

export interface FactNode {
  id: string
  type: "fact"
  factId: string
  factType: FactType
  /** Human-readable fact type, e.g. "Amount". */
  label: string
  /** Masked where the value identifies an account or person. */
  displayValue: string
  /** The value as extracted (screened; never a secret). Shown only when the person asks. */
  rawValue: string
  normalizedValue: string
  correctedValue?: string
  evidenceId: string | null
  evidenceNodeId: string
  transactionId?: string
  recordRole: RecordRole
  sourceType: SourceType
  sourceLocation?: string
  extractionMethod: ExtractionMethod
  extractorVersion?: string
  reviewStatus: FactReviewStatus
  displayStatus: FactDisplayStatus
  userConfirmed: boolean
  /** Case-form facts are changed by editing the case, not reviewed here. */
  reviewable: boolean
  updatedAt: string
}

export interface TransactionNode {
  id: string
  type: "transaction"
  transactionId: string
  label: string
  status: TransactionStatus
  /** Independent evidence sources (duplicates count once; the case form is not counted). */
  sourceCount: number
  factCount: number
  openConflicts: number
}

export type GraphNode = EvidenceNode | FactNode | TransactionNode

export type EdgeRelation = "extracted_from" | "supports" | EvidenceRelation

export interface GraphEdge {
  id: string
  source: string
  target: string
  relation: EdgeRelation
  ruleId?: string
  outcome?: MatchOutcome
  matchId?: string
  explanation: string
  uncertainty?: string
  supportingFactIds: string[]
  reviewStatus?: MatchReviewStatus
  requiresReview: boolean
}

export interface ConflictSide {
  factId: string
  displayValue: string
  rawValue: string
  sourceLabel: string
  evidenceId: string | null
  sourceLocation?: string
}

export interface GraphConflict {
  matchId: string
  ruleId: string
  factType: FactType
  transactionId?: string
  explanation: string
  uncertainty?: string
  reviewStatus: MatchReviewStatus
  sides: [ConflictSide, ConflictSide]
}

export interface MissingItem {
  id: string
  title: string
  detail: string
  severity: "high" | "normal"
  evidenceId?: string
  transactionId?: string
}

export interface GraphSummary {
  evidenceFiles: number
  transactionCandidates: number
  corroboratedFacts: number
  openConflicts: number
  missingItems: number
  unreviewedFacts: number
  totalFacts: number
}

export interface GraphProcessingStatus {
  state: "empty" | "not_processed" | "partial" | "complete"
  processed: number
  notProcessed: number
  failed: number
  unsupported: number
}

export interface EvidenceGraph {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION
  caseId: string
  generatedAt: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  summary: GraphSummary
  conflicts: GraphConflict[]
  missingEvidence: MissingItem[]
  processingStatus: GraphProcessingStatus
}
