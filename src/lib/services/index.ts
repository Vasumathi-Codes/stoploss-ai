/**
 * The single import point for data operations. Swap these exports for real
 * implementations (API client, Foundry-backed agent service) in a later phase.
 */
export {
  actionPlanService,
  agentService,
  caseService,
  demoService,
  evidenceService,
  incidentService,
  profileService,
  resourceService,
} from "./mock"
export type * from "./types"
