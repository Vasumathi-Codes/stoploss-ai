import type {
  EdgeRelation,
  ExtractionMethod,
  FactDisplayStatus,
  FactType,
  MatchOutcome,
  ProcessingStatus,
  SourceType,
  TransactionStatus,
} from "./types"

export const FACT_TYPE_LABELS: Record<FactType, string> = {
  amount: "Amount",
  transaction_reference: "Transaction reference",
  transaction_datetime: "Date and time",
  recipient_upi_id: "Other party · UPI ID",
  recipient_phone: "Other party · phone",
  recipient_account: "Other party · account",
  recipient_name: "Other party · name",
  payment_method: "Payment method",
  transaction_direction: "Direction",
  transaction_status: "Transaction status",
  message_event: "Chat event",
  other: "Other detail",
}

/** Display order of fact types within a transaction. */
export const FACT_TYPE_ORDER: FactType[] = [
  "transaction_reference",
  "amount",
  "transaction_datetime",
  "recipient_upi_id",
  "recipient_phone",
  "recipient_account",
  "recipient_name",
  "transaction_direction",
  "payment_method",
  "transaction_status",
  "message_event",
  "other",
]

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  payment_screenshot: "Payment screenshot",
  sms_notification: "SMS or payment notification",
  bank_statement: "Bank statement",
  chat_export: "Chat or conversation",
  case_details: "Case details (entered by you)",
  other_document: "Other supporting document",
}

export const EXTRACTION_METHOD_LABELS: Record<ExtractionMethod, string> = {
  vision_model: "Screenshot Reader (Microsoft Foundry vision model)",
  statement_parser: "Statement parser (fixed rules, in this app)",
  chat_parser: "Chat parser (fixed rules, in this app)",
  user_entry: "Typed by you in the case form",
}

export const FACT_STATUS_LABELS: Record<FactDisplayStatus, string> = {
  unreviewed: "Not reviewed",
  user_confirmed: "Confirmed by you",
  user_rejected: "Rejected by you",
  user_corrected: "Corrected by you",
  needs_verification: "Needs verification",
  conflicted: "In conflict",
}

export const PROCESSING_LABELS: Record<ProcessingStatus, string> = {
  not_processed: "Not processed",
  processed: "Processed",
  no_facts: "Processed · nothing found",
  failed: "Processing failed",
  unsupported: "Not supported",
}

export const RELATION_LABELS: Record<EdgeRelation, string> = {
  extracted_from: "Extracted from",
  supports: "Supports",
  corroborates: "Corroborates",
  conflicts_with: "Conflicts with",
  possibly_same_transaction: "Possibly the same transaction",
  related_context: "Related context",
}

export const OUTCOME_LABELS: Record<MatchOutcome, string> = {
  match: "Match",
  partial_match: "Partial match",
  conflict: "Conflict",
  insufficient_evidence: "Insufficient evidence",
  unrelated: "Unrelated",
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, { label: string; description: string }> = {
  corroborated: {
    label: "Corroborated",
    description: "At least two independent sources agree on the reference, or on the amount and date.",
  },
  conflicted: { label: "Conflict to review", description: "Sources disagree on at least one detail." },
  single_source: { label: "Single source", description: "Only one piece of evidence describes this transaction so far." },
  reported_only: { label: "Reported only", description: "Only your own report describes this transaction so far." },
}
