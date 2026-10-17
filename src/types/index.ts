/**
 * Central domain types for STOPLOSS AI.
 *
 * These describe the shapes the UI consumes. In the frontend-only phase they are
 * populated by the in-memory mock services; a later backend (PostgreSQL) and the
 * Microsoft Foundry agent service should return the same shapes.
 *
 * Deliberately absent: passwords, UPI PINs, OTPs, card numbers, banking logins.
 */

export type FraudCategory =
  "upi_payment" | "phishing" | "banking_card" | "impersonation" | "account_takeover" | "investment" | "shopping" | "other"

export type CaseStatus =
  | "draft"
  | "reported"
  | "analysis_in_progress"
  | "action_plan_ready"
  | "user_action_required"
  | "reporting_in_progress"
  | "resolved"
  | "archived"

export type TriState = "yes" | "no" | "unsure"

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AED"

export interface CaseNote {
  id: string
  body: string
  createdAt: string
}

export interface Incident {
  id: string
  /** Human-readable case reference, e.g. SL-2610-4821 */
  reference: string
  title: string
  category: FraudCategory
  description: string
  amount: number
  currency: Currency
  occurredAt: string
  reportedAt: string
  updatedAt: string
  paymentMethod: string
  transactionRef?: string
  /** Where the money went: UPI ID, phone number or account. */
  counterparty?: string
  hasAccountAccess: TriState
  ongoing?: TriState
  status: CaseStatus
  notes: CaseNote[]
  /** True for the seeded, clearly fictional demo dataset. */
  isSample: boolean
}

export type EvidenceKind = "image" | "pdf" | "text" | "other"

export interface EvidenceItem {
  id: string
  incidentId: string
  name: string
  kind: EvidenceKind
  mimeType: string
  size: number
  addedAt: string
  description?: string
  /** Session-only blob URL for files picked in this browser tab. Never uploaded. */
  objectUrl?: string
  /** First part of a .txt file, read locally for preview. */
  textPreview?: string
  /** Sample metadata record with no underlying file. */
  isSample: boolean
}

export type AgentId = "incident" | "containment" | "evidence" | "recovery"

export type AgentStatus = "not_started" | "analyzing" | "awaiting_information" | "completed" | "needs_review"

export interface Agent {
  id: AgentId
  name: string
  role: string
  purpose: string
  outputs: string[]
}

/** Where a finding's content comes from — always shown next to it. */
export type FindingSource = "mock_analysis" | "ai_analysis" | "user_supplied" | "verified_guidance" | "unverified_assumption"

/** Which implementation produced an analysis: fixed templates, or a Microsoft Foundry model. */
export type AnalysisEngine = "mock" | "foundry"

export interface AgentFinding {
  id: string
  incidentId: string
  agentId: AgentId
  title: string
  detail: string
  source: FindingSource
  createdAt: string
  /** Optional list content (checklists, missing items, inventory). */
  items?: string[]
  confidence?: "low" | "medium" | "high"
}

export interface AgentRunState {
  status: AgentStatus
  currentTask: string
  startedAt?: string
  completedAt?: string
}

export type IncidentAgentState = Record<AgentId, AgentRunState>

export type ActionPriority = "urgent" | "high" | "normal"

export type ActionStatus = "pending" | "in_progress" | "completed"

/**
 * suggested: proposed by STOPLOSS AI, the user does it.
 * external: a process outside the app (bank, police) the app cannot verify.
 */
export type ActionOrigin = "suggested" | "external"

export interface ActionItem {
  id: string
  incidentId: string
  /** Stable playbook key so reruns don't duplicate actions. */
  key: string
  title: string
  explanation: string
  priority: ActionPriority
  status: ActionStatus
  origin: ActionOrigin
  timing: string
  instructions: string[]
  requiredInfo: string[]
  resourceId?: string
  dependsOn?: string[]
  updatedAt: string
  completedAt?: string
}

export interface ActionPlan {
  id: string
  incidentId: string
  createdAt: string
  items: ActionItem[]
}

export type TimelineActor = "user" | "agent" | "system"

export interface CaseTimelineEvent {
  id: string
  incidentId: string
  at: string
  actor: TimelineActor
  agentId?: AgentId
  title: string
  detail?: string
  tone?: "neutral" | "success" | "warning" | "info"
}

export type ResourceVerification = { status: "unverified" } | { status: "verified"; lastVerified: string }

export interface OfficialResource {
  id: string
  organization: string
  name: string
  purpose: string
  relevance: string
  kind: "portal" | "helpline" | "provider" | "regulator" | "telecom"
  url?: string
  phone?: string
  note?: string
  verification: ResourceVerification
}

export interface UserProfile {
  displayName: string
  email: string
  preferredLanguage: string
  city: string
  phoneHint: string
}

export interface LearningResource {
  id: string
  category: LearningCategory
  title: string
  summary: string
  points: string[]
  readMinutes: number
}

export type LearningCategory = "recognize" | "preserve" | "secure" | "report" | "recovery_scams" | "protect"

export type ScreenshotKind = "bank_sms" | "payment_app" | "bank_statement" | "chat" | "other"

/** Payment details read from one screenshot (see src/server/foundry/extract.ts). Every field is a suggestion the person confirms. */
export interface ScreenshotReading {
  /** The screenshot shows a payment or bank transaction. */
  isPaymentRecord: boolean
  kind: ScreenshotKind
  /** Money left ("debit") or arrived ("credit") in the person's account. */
  direction: "debit" | "credit" | "unclear"
  amount?: number
  currency?: Currency
  /** ISO 8601. Screenshot times without a zone are read as India time. */
  occurredAt?: string
  transactionRef?: string
  counterparty?: string
  paymentMethod?: string
  /** The screenshot shows an OTP, PIN, password or full card number. Those values are never returned. */
  containsSensitiveData: boolean
  note?: string
}
