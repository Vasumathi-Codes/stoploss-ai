/**
 * Service boundaries. Pages and components depend on these interfaces only.
 *
 * Implemented by the API client in ./api, which talks to the Next.js route
 * handlers in `src/app/api` (PostgreSQL via Prisma). Agent orchestration runs on
 * the server (Microsoft Foundry when configured, see src/server/foundry). No
 * page should import a vendor SDK directly.
 */
import type {
  ActionItem,
  AgentFinding,
  AnalysisEngine,
  CaseStatus,
  CaseTimelineEvent,
  Currency,
  EvidenceItem,
  FraudCategory,
  Incident,
  IncidentAgentState,
  OfficialResource,
  TriState,
  UserProfile,
} from "@/types"

/** Everything the UI shows for the current user, as returned by `GET /api/state`. */
export interface AppSnapshot {
  profile: UserProfile
  incidents: Incident[]
  evidence: EvidenceItem[]
  actions: ActionItem[]
  findings: AgentFinding[]
  /** Newest first. */
  timeline: CaseTimelineEvent[]
  agentStates: Record<string, IncidentAgentState>
  resources: OfficialResource[]
  /** Timeline event ids the user has dismissed from the notification menu. */
  readEventIds: string[]
  /** Incidents with an analysis run in progress on the server. */
  runningIncidentIds: string[]
  /** Engine new analysis runs will use (server configuration). */
  analysis: { engine: AnalysisEngine; model?: string }
  /** Engine of each incident's most recent analysis run. */
  incidentEngines: Record<string, AnalysisEngine>
}

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

/** A file picked in the browser. Only its metadata is sent to the server. */
export interface LocalEvidenceFile {
  file: File
  objectUrl?: string
  textPreview?: string
}

export interface IncidentService {
  createIncident(input: NewIncidentInput, files: LocalEvidenceFile[]): Promise<Incident>
}

export interface CaseService {
  updateStatus(incidentId: string, status: CaseStatus): Promise<boolean>
  addNote(incidentId: string, body: string): Promise<boolean>
  removeNote(incidentId: string, noteId: string): Promise<boolean>
  setTransactionRef(incidentId: string, ref: string): Promise<boolean>
}

export interface EvidenceService {
  addFiles(incidentId: string, files: LocalEvidenceFile[]): Promise<boolean>
  remove(evidenceId: string): Promise<boolean>
}

export interface ActionPlanService {
  setStatus(actionId: string, status: ActionItem["status"]): Promise<boolean>
  /** The first step a new case would be advised to take. */
  suggestFirstAction(incident: Incident): Pick<ActionItem, "title" | "explanation"> | undefined
}

export interface AgentService {
  /** Runs (or reruns) the analysis for one incident. Resolves true when all agents settle, false if superseded. */
  runAnalysis(incidentId: string): Promise<boolean>
  isRunning(incidentId: string): boolean
}

export interface ProfileService {
  updateProfile(patch: Partial<UserProfile>): Promise<boolean>
}

export interface DemoService {
  /** Reloads everything from the server. */
  refresh(): Promise<void>
  resetDemoData(): Promise<boolean>
  markEventsRead(ids: string[]): Promise<boolean>
}
