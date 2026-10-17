import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  FileImage,
  FileQuestion,
  FileText,
  Landmark,
  type LucideIcon,
  MessageSquareText,
  PencilLine,
  Smartphone,
  UserRound,
  XCircle,
} from "lucide-react"

import { ToneBadge } from "@/components/shared/status-badges"
import { FACT_STATUS_LABELS, PROCESSING_LABELS, TRANSACTION_STATUS_LABELS } from "@/lib/evidence/labels"
import type {
  EdgeRelation,
  FactDisplayStatus,
  MatchOutcome,
  ProcessingStatus,
  SourceType,
  TransactionStatus,
} from "@/lib/evidence/types"
import type { Tone } from "@/lib/utils/tone"

export const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  payment_screenshot: Smartphone,
  sms_notification: MessageSquareText,
  bank_statement: Landmark,
  chat_export: MessageSquareText,
  case_details: UserRound,
  other_document: FileQuestion,
}

const KIND_ICONS: Record<string, LucideIcon> = { image: FileImage, pdf: FileText, text: FileText, other: FileQuestion }

/** The icon for an evidence source: by detected source type, else by file kind. */
export function EvidenceIcon({ sourceType, kind, className }: { sourceType?: SourceType; kind?: string; className?: string }) {
  const Icon = sourceType ? SOURCE_ICONS[sourceType] : (KIND_ICONS[kind ?? "other"] ?? FileQuestion)
  return <Icon aria-hidden className={className} />
}

export const FACT_STATUS_META: Record<FactDisplayStatus, { tone: Tone; icon: LucideIcon }> = {
  unreviewed: { tone: "muted", icon: CircleDashed },
  user_confirmed: { tone: "success", icon: CheckCircle2 },
  user_corrected: { tone: "info", icon: PencilLine },
  user_rejected: { tone: "muted", icon: XCircle },
  needs_verification: { tone: "warning", icon: CircleHelp },
  conflicted: { tone: "danger", icon: AlertTriangle },
}

export function FactStatusBadge({ status, className }: { status: FactDisplayStatus; className?: string }) {
  const { tone, icon } = FACT_STATUS_META[status]
  return (
    <ToneBadge tone={tone} icon={icon} className={className}>
      {FACT_STATUS_LABELS[status]}
    </ToneBadge>
  )
}

const TX_META: Record<TransactionStatus, { tone: Tone; icon: LucideIcon }> = {
  corroborated: { tone: "success", icon: CheckCircle2 },
  conflicted: { tone: "danger", icon: AlertTriangle },
  single_source: { tone: "warning", icon: CircleHelp },
  reported_only: { tone: "muted", icon: UserRound },
}

export function TransactionStatusBadge({ status, className }: { status: TransactionStatus; className?: string }) {
  const { tone, icon } = TX_META[status]
  return (
    <ToneBadge tone={tone} icon={icon} className={className} title={TRANSACTION_STATUS_LABELS[status].description}>
      {TRANSACTION_STATUS_LABELS[status].label}
    </ToneBadge>
  )
}

const PROCESSING_META: Record<ProcessingStatus, { tone: Tone; icon: LucideIcon }> = {
  not_processed: { tone: "muted", icon: CircleDashed },
  processed: { tone: "success", icon: CheckCircle2 },
  no_facts: { tone: "neutral", icon: CircleHelp },
  failed: { tone: "danger", icon: AlertTriangle },
  unsupported: { tone: "muted", icon: Ban },
}

export function ProcessingBadge({ status, className }: { status: ProcessingStatus; className?: string }) {
  const { tone, icon } = PROCESSING_META[status]
  return (
    <ToneBadge tone={tone} icon={icon} className={className}>
      {PROCESSING_LABELS[status]}
    </ToneBadge>
  )
}

/**
 * Edge styling. Every relation has its own dash pattern and a glyph at its midpoint,
 * so the graph never relies on colour alone.
 */
export const EDGE_STYLE: Record<EdgeRelation, { stroke: string; dash?: string; width: number; glyph?: string }> = {
  extracted_from: { stroke: "var(--muted-foreground)", width: 1, dash: undefined },
  supports: { stroke: "var(--primary)", width: 1.5 },
  corroborates: { stroke: "var(--success)", width: 2, glyph: "=" },
  conflicts_with: { stroke: "var(--destructive)", width: 2, dash: "3 3", glyph: "≠" },
  possibly_same_transaction: { stroke: "var(--warning)", width: 2, dash: "1 4", glyph: "?" },
  related_context: { stroke: "var(--info)", width: 1.5, dash: "8 4", glyph: "…" },
}

/** Partial matches are drawn dashed with "≈", whatever their relation. */
export function edgeStyle(relation: EdgeRelation, outcome?: MatchOutcome) {
  const base = EDGE_STYLE[relation]
  if (relation === "corroborates" && outcome === "partial_match") return { ...base, dash: "6 3", glyph: "≈" }
  return base
}
