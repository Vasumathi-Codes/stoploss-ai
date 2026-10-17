/**
 * Presentation helpers for response plans and agent output. Pure functions over
 * data the server already returns — nothing here invents steps, scores or findings.
 */
import { PRIORITIES } from "@/lib/config/taxonomy"
import type { ActionItem, AgentFinding, AnalysisEngine } from "@/types"

const rank = (a: ActionItem) => PRIORITIES[a.priority].rank

/** True when every step this one depends on is complete. */
export function prerequisitesDone(action: ActionItem, plan: ActionItem[]): boolean {
  return (action.dependsOn ?? []).every((key) => {
    const dep = plan.find((p) => p.key === key)
    return !dep || dep.status === "completed"
  })
}

/**
 * One suggested order for a case's plan: open steps first, with prerequisites
 * before the steps that depend on them, then by priority, then by when the step
 * was added. Completed steps follow in the order they were done.
 */
export function orderPlan(actions: ActionItem[]): ActionItem[] {
  const open = actions.filter((a) => a.status !== "completed")
  const done = actions
    .filter((a) => a.status === "completed")
    .sort((a, b) => (a.completedAt ?? a.updatedAt).localeCompare(b.completedAt ?? b.updatedAt))

  const byKey = new Map(open.map((a) => [a.key, a]))
  const ordered: ActionItem[] = []
  const placed = new Set<string>()
  // Steps already in progress lead, then priority, then original order (stable sort).
  const queue = [...open].sort((a, b) => {
    const progress = Number(b.status === "in_progress") - Number(a.status === "in_progress")
    return progress || rank(a) - rank(b)
  })

  const place = (a: ActionItem, path: Set<string>) => {
    if (placed.has(a.key) || path.has(a.key)) return
    path.add(a.key)
    for (const key of a.dependsOn ?? []) {
      const dep = byKey.get(key)
      if (dep) place(dep, path)
    }
    placed.add(a.key)
    ordered.push(a)
  }
  for (const a of queue) place(a, new Set())
  return [...ordered, ...done]
}

/** The first open step in plan order whose prerequisites are complete. */
export function nextStep(actions: ActionItem[]): ActionItem | undefined {
  return orderPlan(actions).find((a) => a.status !== "completed" && prerequisitesDone(a, actions))
}

export interface OpenPriority {
  urgent: number
  high: number
  open: number
}

/** Counts of open steps by priority — the basis for "attention" indicators. */
export function openPriority(actions: ActionItem[]): OpenPriority {
  const open = actions.filter((a) => a.status !== "completed")
  return {
    urgent: open.filter((a) => a.priority === "urgent").length,
    high: open.filter((a) => a.priority === "high").length,
    open: open.length,
  }
}

/**
 * Where an agent's current output came from, read from the stored finding sources:
 * - "ai": the agent has model-written findings
 * - "fallback": the case ran on Foundry but this agent shows template output
 * - "template": the case ran on the template engine
 * - "none": no output yet
 */
export type Provenance = "ai" | "fallback" | "template" | "none"

export function agentProvenance(findings: AgentFinding[], engine: AnalysisEngine | undefined): Provenance {
  if (findings.length === 0) return "none"
  // Template output always includes `mock_analysis`; model runs replace it entirely
  // (see composeFindings in src/server/pipeline.ts).
  if (findings.some((f) => f.source === "mock_analysis")) return engine === "foundry" ? "fallback" : "template"
  return findings.some((f) => f.source === "ai_analysis" || f.source === "unverified_assumption") ? "ai" : "template"
}
