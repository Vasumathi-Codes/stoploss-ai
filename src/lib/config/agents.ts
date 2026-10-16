import type { Agent, AgentId } from "@/types"

export const AGENTS: Record<AgentId, Agent> = {
  incident: {
    id: "incident",
    name: "Incident Agent",
    role: "Reconstructs what happened",
    purpose: "Builds a structured summary of the suspected fraud from the information you supply.",
    outputs: ["Event summary", "Suspected fraud category", "Missing information", "Confidence label"],
  },
  containment: {
    id: "containment",
    name: "Containment Agent",
    role: "Organises urgent next steps",
    purpose: "Turns general, configured guidance into a prioritised checklist for your situation.",
    outputs: ["Priority checklist", "Supporting reasoning", "Official resources", "Human action required"],
  },
  evidence: {
    id: "evidence",
    name: "Evidence Agent",
    role: "Organises your evidence",
    purpose:
      "Builds an inventory of what you have added and points out documentation gaps. It does not perform forensic analysis.",
    outputs: ["Evidence inventory", "Missing documents or references", "Evidence package checklist"],
  },
  recovery: {
    id: "recovery",
    name: "Recovery Coordinator",
    role: "Prepares complaint information",
    purpose:
      "Assembles what you'll need for official reporting and tracks your progress. It never contacts anyone on your behalf.",
    outputs: ["Complaint preparation checklist", "Required information summary", "Official reporting links", "Progress tracking"],
  },
}

export const AGENT_ORDER: AgentId[] = ["incident", "containment", "evidence", "recovery"]

/**
 * Agent dependency order. Agents in the same stage only depend on earlier
 * stages, so they run in parallel:
 *   Incident → (Containment ‖ Evidence) → Recovery Coordinator
 */
export const AGENT_STAGES: AgentId[][] = [["incident"], ["containment", "evidence"], ["recovery"]]

/** The agents whose output an agent receives (everything from earlier stages). */
export function agentInputs(agentId: AgentId): AgentId[] {
  const stage = AGENT_STAGES.findIndex((s) => s.includes(agentId))
  return AGENT_STAGES.slice(0, stage).flat()
}
