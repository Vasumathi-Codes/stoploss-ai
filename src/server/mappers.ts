/**
 * Database rows → the UI shapes in `@/types`. Dates become ISO strings, Decimal
 * becomes number and SQL nulls become `undefined`.
 */
import type * as Db from "@/generated/prisma/client"
import type {
  ActionItem,
  AgentFinding,
  AgentId,
  AgentRunState,
  CaseNote,
  CaseTimelineEvent,
  EvidenceItem,
  Incident,
  IncidentAgentState,
  OfficialResource,
  UserProfile,
} from "@/types"

const iso = (d: Date) => d.toISOString()
const isoOpt = (d: Date | null) => (d ? d.toISOString() : undefined)
const opt = <T>(v: T | null): T | undefined => v ?? undefined

export function toNote(n: Db.CaseNote): CaseNote {
  return { id: n.id, body: n.body, createdAt: iso(n.createdAt) }
}

export function toIncident(i: Db.Incident & { notes: Db.CaseNote[] }): Incident {
  return {
    id: i.id,
    reference: i.reference,
    title: i.title,
    category: i.category,
    description: i.description,
    amount: i.amount.toNumber(),
    currency: i.currency,
    occurredAt: iso(i.occurredAt),
    reportedAt: iso(i.reportedAt),
    updatedAt: iso(i.updatedAt),
    paymentMethod: i.paymentMethod,
    transactionRef: opt(i.transactionRef),
    hasAccountAccess: i.hasAccountAccess,
    ongoing: opt(i.ongoing),
    status: i.status,
    notes: i.notes.map(toNote),
    isSample: i.isSample,
  }
}

export function toEvidence(e: Db.EvidenceItem): EvidenceItem {
  return {
    id: e.id,
    incidentId: e.incidentId,
    name: e.name,
    kind: e.kind,
    mimeType: e.mimeType,
    size: e.size,
    addedAt: iso(e.addedAt),
    description: opt(e.description),
    textPreview: opt(e.textPreview),
    isSample: e.isSample,
  }
}

export function toAction(a: Db.ActionItem): ActionItem {
  return {
    id: a.id,
    incidentId: a.incidentId,
    key: a.key,
    title: a.title,
    explanation: a.explanation,
    priority: a.priority,
    status: a.status,
    origin: a.origin,
    timing: a.timing,
    instructions: a.instructions,
    requiredInfo: a.requiredInfo,
    resourceId: opt(a.resourceId),
    dependsOn: a.dependsOn.length > 0 ? a.dependsOn : undefined,
    updatedAt: iso(a.updatedAt),
    completedAt: isoOpt(a.completedAt),
  }
}

export function toFinding(f: Db.AgentFinding): AgentFinding {
  return {
    id: f.id,
    incidentId: f.incidentId,
    agentId: f.agentId,
    title: f.title,
    detail: f.detail,
    source: f.source,
    createdAt: iso(f.createdAt),
    items: f.items.length > 0 ? f.items : undefined,
    confidence: opt(f.confidence),
  }
}

export function toTimelineEvent(e: Db.TimelineEvent): CaseTimelineEvent {
  return {
    id: e.id,
    incidentId: e.incidentId,
    at: iso(e.at),
    actor: e.actor,
    agentId: opt(e.agentId),
    title: e.title,
    detail: opt(e.detail),
    tone: e.tone,
  }
}

export function toAgentRunState(s: Db.AgentState): AgentRunState {
  return { status: s.status, currentTask: s.currentTask, startedAt: isoOpt(s.startedAt), completedAt: isoOpt(s.completedAt) }
}

/** Groups agent_states rows into the per-incident record the UI expects. */
export function toAgentStates(rows: Db.AgentState[]): Record<string, IncidentAgentState> {
  const out: Record<string, Partial<Record<AgentId, AgentRunState>>> = {}
  for (const row of rows) (out[row.incidentId] ??= {})[row.agentId] = toAgentRunState(row)
  return out as Record<string, IncidentAgentState>
}

export function toResource(r: Db.OfficialResource): OfficialResource {
  return {
    id: r.id,
    organization: r.organization,
    name: r.name,
    purpose: r.purpose,
    relevance: r.relevance,
    kind: r.kind,
    url: opt(r.url),
    phone: opt(r.phone),
    note: opt(r.note),
    verification: r.verifiedAt ? { status: "verified", lastVerified: iso(r.verifiedAt) } : { status: "unverified" },
  }
}

export function toProfile(u: Db.User): UserProfile {
  return {
    displayName: u.displayName,
    email: u.email,
    preferredLanguage: u.preferredLanguage,
    city: u.city ?? "",
    phoneHint: u.phoneHint ?? "",
  }
}
