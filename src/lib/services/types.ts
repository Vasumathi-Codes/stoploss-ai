/**
 * Service boundaries. Pages and components depend on these interfaces only.
 *
 * Frontend phase: implemented by in-memory mocks in ./mock.
 * Later phase: incidents/cases/evidence/actions move to a PostgreSQL-backed API,
 * and AgentService is implemented with Microsoft Foundry on the server. No page
 * should import a vendor SDK directly.
 */
import type { ActionItem, CaseStatus, Currency, FraudCategory, Incident, OfficialResource, TriState, UserProfile } from "@/types"

export interface NewIncidentInput {
  category: FraudCategory
  title: string
  description: string
  amount: number
  currency: Currency
  occurredAt: string
  paymentMethod: string
  transactionRef?: string
  hasAccountAccess: TriState
  ongoing?: TriState
}

export interface LocalEvidenceFile {
  file: File
  objectUrl?: string
  textPreview?: string
}

export interface IncidentService {
  createIncident(input: NewIncidentInput, files: LocalEvidenceFile[]): Promise<Incident>
}

export interface CaseService {
  updateStatus(incidentId: string, status: CaseStatus): void
  addNote(incidentId: string, body: string): void
  removeNote(incidentId: string, noteId: string): void
  setTransactionRef(incidentId: string, ref: string): void
}

export interface EvidenceService {
  addFiles(incidentId: string, files: LocalEvidenceFile[]): void
  remove(evidenceId: string): void
}

export interface ActionPlanService {
  setStatus(actionId: string, status: ActionItem["status"]): void
  /** The first step a new case would be advised to take. */
  suggestFirstAction(incident: Incident): Pick<ActionItem, "title" | "explanation"> | undefined
}

export interface AgentService {
  /** Runs (or reruns) the analysis for one incident. Resolves true when all agents settle, false if cancelled. */
  runAnalysis(incidentId: string): Promise<boolean>
  isRunning(incidentId: string): boolean
  cancelAll(): void
}

export interface ResourceService {
  listOfficialResources(): OfficialResource[]
}

export interface ProfileService {
  updateProfile(patch: Partial<UserProfile>): void
}

export interface DemoService {
  resetDemoData(): void
  markEventsRead(ids: string[]): void
}
