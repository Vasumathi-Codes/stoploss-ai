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
  ScreenshotReading,
  TriState,
  UserProfile,
} from "@/types"
import type { EvidenceGraph } from "@/lib/evidence/types"
import type { AnalyzeSource, FactReviewBody } from "@/lib/validation/evidence-graph"

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
  counterparty?: string
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
  /** Adds details read from a screenshot (or typed) to an existing case. */
  updateDetails(incidentId: string, patch: { transactionRef?: string; counterparty?: string }): Promise<boolean>
}

export interface EvidenceService {
  addFiles(incidentId: string, files: LocalEvidenceFile[]): Promise<boolean>
  remove(evidenceId: string): Promise<boolean>
  /**
   * Re-opens a file from the device for an existing evidence record, in this tab only (e.g. after a
   * reload). Nothing is uploaded. Resolves false, after a toast, if the file's type doesn't match.
   */
  attachLocalFile(evidenceId: string, file: File): Promise<boolean>
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

export interface ExtractionService {
  /** Sends one image, with the person's consent, to be read. Never stored. */
  readScreenshot(file: File): Promise<ScreenshotReading>
  /**
   * Reads a case's evidence image. The server also holds the validated result briefly under
   * `readingId`, so it can be saved to Evidence Intelligence without sending the image again.
   */
  readEvidenceScreenshot(file: File, evidenceId: string): Promise<{ reading: ScreenshotReading; readingId?: string }>
}

export interface EvidenceGraphService {
  /** The case's graph from persisted data. Throws ApiError on failure (callers show the error state). */
  get(incidentId: string): Promise<EvidenceGraph>
  /** Adds facts from the given sources and re-matches. Resolves undefined (after a toast) on failure. */
  analyze(incidentId: string, sources: AnalyzeSource[]): Promise<EvidenceGraph | undefined>
  /** One review action on a fact or one of its conflicts. Resolves undefined (after a toast) on failure. */
  review(incidentId: string, factId: string, body: FactReviewBody): Promise<EvidenceGraph | undefined>
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
