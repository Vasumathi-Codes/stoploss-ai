import type { FindingDraft } from "@/lib/playbooks"
import type { AgentId, AgentRunState, FindingSource } from "@/types"

import { AGENT_STAGES } from "@/lib/config/agents"

export { AGENT_STAGES }

/**
 * Runs `step` for every agent, stage by stage. Each step receives everything
 * produced by earlier stages (never by agents in its own stage) and returns
 * what it produced. Stops early, returning false, once `isLive` says the run
 * was cancelled or superseded.
 */
export async function runStages<T>(
  step: (agentId: AgentId, prior: readonly T[]) => Promise<T[]>,
  isLive: () => Promise<boolean>,
  stages: AgentId[][] = AGENT_STAGES,
): Promise<boolean> {
  const prior: T[] = []
  for (const stage of stages) {
    if (!(await isLive())) return false
    const snapshot = [...prior]
    const outputs = await Promise.all(stage.map((agentId) => step(agentId, snapshot)))
    for (const out of outputs) prior.push(...out)
  }
  return isLive()
}

/* ------------------------------------------------------------------ */
/* Per-agent outcome rules (pure, shared by runs and tests)            */
/* ------------------------------------------------------------------ */

/** Sources the model may produce. */
export const AI_SOURCES: FindingSource[] = ["ai_analysis", "unverified_assumption"]
/** Template findings that are facts (user input, configured guidance) and stay alongside AI output. */
export const FACT_SOURCES: FindingSource[] = ["user_supplied", "verified_guidance"]

/**
 * The findings stored for one agent: the model's findings followed by the template's
 * factual ones, or the full template output when there is no model output.
 */
export function composeFindings(template: FindingDraft[], ai?: FindingDraft[]): FindingDraft[] {
  return ai ? [...ai, ...template.filter((f) => FACT_SOURCES.includes(f.source))] : template
}

export type AgentOutcome =
  { engine: "mock" } | { engine: "foundry"; ai: { review?: string } } | { engine: "foundry"; failure: string }

type Settled = Pick<AgentRunState, "status" | "currentTask">

/**
 * Final status for an agent. Missing information (from the playbook rules) always wins;
 * otherwise a Foundry fallback or a model review request downgrades "completed" to
 * "needs_review" so the person knows the output wasn't produced or checked as expected.
 */
export function settleAgentOutcome(settled: Settled, outcome: AgentOutcome): Settled {
  if (settled.status !== "completed" || outcome.engine === "mock") return settled
  if ("failure" in outcome) {
    return { status: "needs_review", currentTask: "AI unavailable — showing template output; rerun to retry" }
  }
  if (outcome.ai.review) return { status: "needs_review", currentTask: clipTask(outcome.ai.review) }
  return settled
}

/** Shortens a task line to `max` characters at a word boundary, with an ellipsis. */
export function clipTask(text: string, max = 140): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—-]+$/, "")}…`
}
