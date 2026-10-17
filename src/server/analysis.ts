/**
 * Server-side agent orchestration.
 *
 * Two engines share this pipeline:
 * - "foundry": each agent is a Microsoft Foundry model call (src/server/foundry),
 *   given the case and the findings of the agents before it. Its output is
 *   labelled `ai_analysis` / `unverified_assumption`.
 * - "mock": the deterministic playbooks, used when Foundry isn't configured and
 *   as a per-agent fallback when a Foundry call fails.
 *
 * In both engines the action plan comes from the curated playbooks, and the
 * factual findings (what the user entered, configured guidance) are rebuilt
 * deterministically — the model never authors "verified" content.
 */
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { CASE_STATUSES } from "@/lib/config/taxonomy"
import {
  buildActionItems,
  buildFindings,
  type FindingDraft,
  idleAgentState,
  RUNNING_TASKS,
  settleAgentStatus,
} from "@/lib/playbooks"
import { addEvents, loadContext, type NewEvent } from "@/server/context"
import { type DbTx, prisma } from "@/server/db"
import { type FoundryAgentResult, PROMPT_VERSION, runFoundryAgent, type PriorFinding } from "@/server/foundry/agents"
import { describeFoundryError, type FoundryConfig, getFoundryConfig } from "@/server/foundry/client"
import { HttpError } from "@/server/errors"
import { toResource } from "@/server/mappers"
import { type AgentOutcome, AI_SOURCES, composeFindings, FACT_SOURCES, runStages, settleAgentOutcome } from "@/server/pipeline"
import type { AgentId, AnalysisEngine, CaseStatus } from "@/types"

const STEP_MS = Number(process.env.ANALYSIS_STEP_MS ?? 1400)
/** A run still "running" after this long was interrupted (e.g. a server restart). */
function staleRunMs() {
  const foundry = getFoundryConfig()
  // Each Foundry call may take up to its timeout, plus one retry.
  const perAgent = foundry ? foundry.timeoutMs * 2 : STEP_MS * 4
  return Math.max(60_000, perAgent * AGENT_ORDER.length + 30_000)
}
const MAX_FOUNDRY_RUNS_PER_HOUR = Number(process.env.FOUNDRY_MAX_RUNS_PER_HOUR ?? 20)
const PRESERVED_STATUSES: CaseStatus[] = ["reporting_in_progress", "resolved", "archived"]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Writes shared by runs and refreshes                                 */
/* ------------------------------------------------------------------ */

/**
 * Replaces one agent's findings.
 * - `ai` given: the model's findings, followed by the template's factual findings.
 * - `"keep-ai"`: keeps the existing model findings and rebuilds only the factual ones
 *   (used when user edits refresh an agent that last ran on Foundry).
 * - omitted: the full template output.
 */
async function writeFindings(
  db: DbTx,
  incidentId: string,
  agentId: AgentId,
  runId: string | null,
  at: Date,
  ai?: FindingDraft[] | "keep-ai",
) {
  const ctx = await loadContext(db, incidentId)
  if (!ctx) return undefined
  const template = buildFindings(agentId, ctx)

  let rows: FindingDraft[]
  let offset = 0
  if (ai === "keep-ai") {
    offset = await db.agentFinding.count({ where: { incidentId, agentId, source: { in: AI_SOURCES } } })
    await db.agentFinding.deleteMany({ where: { incidentId, agentId, source: { notIn: AI_SOURCES } } })
    rows = template.filter((f) => FACT_SOURCES.includes(f.source))
  } else {
    await db.agentFinding.deleteMany({ where: { incidentId, agentId } })
    rows = composeFindings(template, ai)
  }

  await db.agentFinding.createMany({
    data: rows.map((f, i) => ({
      incidentId,
      agentId,
      runId,
      position: offset + i,
      title: f.title,
      detail: f.detail,
      source: f.source,
      items: f.items ?? [],
      confidence: f.confidence,
      createdAt: at,
    })),
  })
  return ctx
}

/** Adds playbook actions the incident doesn't have yet. Existing progress is kept. */
async function addMissingActions(db: DbTx, incidentId: string) {
  const ctx = await loadContext(db, incidentId)
  if (!ctx) return 0
  const existing = new Set(ctx.actions.map((a) => a.key))
  const base = Date.now()
  const fresh = buildActionItems(ctx.incident, new Date(base).toISOString(), () => "").filter((a) => !existing.has(a.key))
  if (fresh.length === 0) return 0
  await db.actionItem.createMany({
    data: fresh.map((a, i) => ({
      incidentId,
      key: a.key,
      title: a.title,
      explanation: a.explanation,
      priority: a.priority,
      origin: a.origin,
      timing: a.timing,
      instructions: a.instructions,
      requiredInfo: a.requiredInfo,
      dependsOn: a.dependsOn ?? [],
      resourceId: a.resourceId,
      createdAt: new Date(base + i),
    })),
    skipDuplicates: true,
  })
  return fresh.length
}

export async function resetAgentStates(db: DbTx, incidentId: string) {
  const idle = idleAgentState()
  await db.agentState.deleteMany({ where: { incidentId } })
  await db.agentState.createMany({
    data: AGENT_ORDER.map((agentId) => ({
      incidentId,
      agentId,
      status: idle[agentId].status,
      currentTask: idle[agentId].currentTask,
    })),
  })
}

/* ------------------------------------------------------------------ */
/* Full analysis run                                                   */
/* ------------------------------------------------------------------ */

/**
 * Prepares a run synchronously and returns a function that performs the agent
 * steps. Route handlers schedule that function with `after()` so the response
 * returns immediately and the client watches progress through `/api/state`.
 */
export async function startAnalysis(incidentId: string) {
  const foundry = getFoundryConfig()
  const engine: AnalysisEngine = foundry ? "foundry" : "mock"
  const { run, previousStatus } = await prisma.$transaction(async (tx) => {
    // Serialise starts for one incident so concurrent requests can't both pass the checks below.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${incidentId}))`
    const incident = await tx.incident.findUniqueOrThrow({ where: { id: incidentId } })

    // Duplicate protection: a live run must finish first. Runs older than the stale
    // limit were abandoned (e.g. a server restart) and are superseded.
    const staleBefore = new Date(Date.now() - staleRunMs())
    const live = await tx.analysisRun.count({ where: { incidentId, status: "running", startedAt: { gte: staleBefore } } })
    if (live > 0) throw new HttpError(409, "An analysis is already running for this case. Wait for it to finish.")
    await tx.analysisRun.updateMany({
      where: { incidentId, status: "running" },
      data: { status: "cancelled", completedAt: new Date(), error: "Superseded after it stopped responding" },
    })

    // Cost control: cap model-backed runs per user per hour.
    if (foundry) {
      const recent = await tx.analysisRun.count({
        where: { engine: "foundry", startedAt: { gte: new Date(Date.now() - 3_600_000) }, incident: { userId: incident.userId } },
      })
      if (recent >= MAX_FOUNDRY_RUNS_PER_HOUR) {
        throw new HttpError(429, "AI analysis limit reached for this hour. Please try again later.")
      }
    }

    const run = await tx.analysisRun.create({
      data: { incidentId, engine, model: foundry?.deployment, promptVersion: foundry ? PROMPT_VERSION : null },
    })
    await tx.agentFinding.deleteMany({ where: { incidentId } })
    await resetAgentStates(tx, incidentId)
    await tx.incident.update({ where: { id: incidentId }, data: { status: "analysis_in_progress" } })
    await addEvents(tx, incidentId, [
      foundry
        ? {
            actor: "system",
            title: "AI analysis started",
            detail: `Microsoft Foundry · ${foundry.deployment}. AI output is not verified.`,
            tone: "info",
          }
        : { actor: "system", title: "Simulated analysis started", detail: "Demo workflow — no AI model is called", tone: "info" },
    ])
    const previousStatus: CaseStatus = incident.status === "analysis_in_progress" ? "reported" : incident.status
    return { run, previousStatus }
  })

  return () => executeRun(run.id, incidentId, previousStatus, foundry)
}

async function isLive(runId: string) {
  const run = await prisma.analysisRun.findUnique({ where: { id: runId }, select: { status: true } })
  return run?.status === "running"
}

/**
 * Calls one Foundry agent. Never throws: a failure (timeout, API error, malformed or unsafe
 * output) is logged as a safe classification and returned, so the run can fall back.
 */
async function callFoundryAgent(
  foundry: FoundryConfig,
  agentId: AgentId,
  incidentId: string,
  prior: PriorFinding[],
  runId: string,
): Promise<FoundryAgentResult | { failure: string }> {
  try {
    const [ctx, resources] = await Promise.all([
      loadContext(prisma, incidentId),
      prisma.officialResource.findMany({ orderBy: { createdAt: "asc" } }),
    ])
    if (!ctx) return { failure: "Case not found" }
    return await runFoundryAgent(foundry, agentId, ctx, resources.map(toResource), prior, runId)
  } catch (error) {
    // Raw error messages can echo request content, so only the classification is logged.
    const { kind, message } = describeFoundryError(error)
    console.error(`[foundry] run=${runId} agent=${agentId} failed: ${kind}`)
    return { failure: message }
  }
}

async function executeRun(runId: string, incidentId: string, previousStatus: CaseStatus, foundry?: FoundryConfig) {
  /** Agents whose Foundry call failed and fell back to templates, with the safe reason. */
  const fallbacks: string[] = []

  const step = async (agentId: AgentId, prior: readonly PriorFinding[]): Promise<PriorFinding[]> => {
    await prisma.agentState.update({
      where: { incidentId_agentId: { incidentId, agentId } },
      data: { status: "analyzing", currentTask: RUNNING_TASKS[agentId], startedAt: new Date(), completedAt: null },
    })

    // The Containment Agent produces the action plan from the curated playbooks,
    // before its analysis, so the model reasons about the actual plan.
    const events: NewEvent[] = []
    if (agentId === "containment") {
      const added = await addMissingActions(prisma, incidentId)
      if (added > 0) {
        events.push({ actor: "agent", agentId, title: "Action plan generated", detail: `${added} suggested steps`, tone: "info" })
      }
    }

    let ai: FoundryAgentResult | undefined
    let outcome: AgentOutcome = { engine: "mock" }
    if (foundry) {
      const result = await callFoundryAgent(foundry, agentId, incidentId, [...prior], runId)
      if ("failure" in result) outcome = { engine: "foundry", failure: result.failure }
      else {
        ai = result
        outcome = { engine: "foundry", ai }
      }
    } else {
      await sleep(STEP_MS)
    }
    if ("failure" in outcome) {
      fallbacks.push(`${agentId} (${outcome.failure})`)
      events.push({
        actor: "system",
        title: `${AGENTS[agentId].name}: AI output unavailable`,
        detail: `${outcome.failure}. Template output was used for this agent instead. Rerun to retry.`,
        tone: "warning",
      })
    }
    if (!(await isLive(runId))) return []

    await prisma.$transaction(async (tx) => {
      const at = new Date()
      const ctx = await writeFindings(tx, incidentId, agentId, runId, at, ai?.findings)
      if (!ctx) return
      const settled = settleAgentOutcome(settleAgentStatus(agentId, ctx), outcome)
      await tx.agentState.update({
        where: { incidentId_agentId: { incidentId, agentId } },
        data: { status: settled.status, currentTask: settled.currentTask, completedAt: at },
      })
      events.push({
        actor: "agent",
        agentId,
        title: `${AGENTS[agentId].name}: ${settled.currentTask}`,
        tone: settled.status === "completed" ? "success" : "warning",
      })
      if (agentId === "evidence" && !ctx.incident.transactionRef) {
        events.push({ actor: "agent", agentId, title: "Missing transaction reference identified", tone: "warning" })
      }
      await addEvents(tx, incidentId, events)
    })
    return ai ? ai.findings.map((f) => ({ ...f, agentId })) : []
  }

  try {
    if (!(await runStages(step, () => isLive(runId)))) return

    await prisma.$transaction(async (tx) => {
      const run = await tx.analysisRun.findUnique({ where: { id: runId } })
      if (run?.status !== "running") return
      const evidence = await tx.agentState.findUnique({
        where: { incidentId_agentId: { incidentId, agentId: "evidence" } },
      })
      const nextStatus: CaseStatus = PRESERVED_STATUSES.includes(previousStatus)
        ? previousStatus
        : evidence?.status === "awaiting_information"
          ? "user_action_required"
          : "action_plan_ready"
      await tx.incident.update({ where: { id: incidentId }, data: { status: nextStatus } })
      await tx.analysisRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedAt: new Date(),
          error: fallbacks.length > 0 ? `Template fallback used for: ${fallbacks.join(", ")}` : null,
        },
      })
      await addEvents(tx, incidentId, [
        { actor: "system", title: "Case ready for your review", detail: CASE_STATUSES[nextStatus].label, tone: "success" },
      ])
    })
  } catch (error) {
    // The incident may have been deleted mid-run (e.g. a demo reset); that's not an error worth surfacing.
    const stillExists = await prisma.incident.count({ where: { id: incidentId } }).catch(() => 0)
    if (!stillExists) return
    // Log the message only: errors can carry case data.
    console.error(`[analysis] run=${runId} failed:`, error instanceof Error ? error.message : "unknown error")
    await failRun(runId, incidentId, previousStatus, "Analysis stopped unexpectedly").catch(() => undefined)
  }
}

async function failRun(runId: string, incidentId: string, restoreStatus: CaseStatus, message: string) {
  await prisma.$transaction(async (tx) => {
    await tx.analysisRun.update({ where: { id: runId }, data: { status: "failed", completedAt: new Date(), error: message } })
    await tx.agentState.updateMany({
      where: { incidentId, status: "analyzing" },
      data: { status: "needs_review", currentTask: "Analysis was interrupted — please rerun" },
    })
    await tx.incident.updateMany({ where: { id: incidentId, status: "analysis_in_progress" }, data: { status: restoreStatus } })
    await addEvents(tx, incidentId, [
      { actor: "system", title: message, detail: "Rerun the analysis to continue", tone: "warning" },
    ])
  })
}

/** Marks runs abandoned by a server restart as failed so the UI isn't stuck "analyzing". */
export async function recoverStaleRuns(userId: string) {
  const stale = await prisma.analysisRun.findMany({
    where: { status: "running", startedAt: { lt: new Date(Date.now() - staleRunMs()) }, incident: { userId } },
  })
  for (const run of stale) await failRun(run.id, run.incidentId, "reported", "Analysis was interrupted")
}

/* ------------------------------------------------------------------ */
/* Incremental refresh after user edits                                */
/* ------------------------------------------------------------------ */

/** Recomputes one agent's output after the user changes underlying data. */
export async function refreshAgent(db: DbTx, incidentId: string, agentId: AgentId) {
  const current = await db.agentState.findUnique({ where: { incidentId_agentId: { incidentId, agentId } } })
  // Only agents that have already produced output are refreshed.
  if (!current || current.status === "not_started" || current.status === "analyzing") return

  const at = new Date()
  // If this agent last ran on Foundry, keep the model's findings and rebuild only the facts.
  const hasAi = (await db.agentFinding.count({ where: { incidentId, agentId, source: "ai_analysis" } })) > 0
  const ctx = await writeFindings(db, incidentId, agentId, null, at, hasAi ? "keep-ai" : undefined)
  if (!ctx) return
  const settled = settleAgentStatus(agentId, ctx)
  await db.agentState.update({
    where: { incidentId_agentId: { incidentId, agentId } },
    data: { status: settled.status, currentTask: settled.currentTask, completedAt: at },
  })

  if (agentId !== "evidence" || current.status === settled.status) return
  const status = ctx.incident.status
  if (settled.status === "completed") {
    await addEvents(db, incidentId, [
      { actor: "agent", agentId, title: "Evidence Agent: required information received", tone: "success" },
    ])
    if (status === "user_action_required") {
      await db.incident.update({ where: { id: incidentId }, data: { status: "action_plan_ready" } })
    }
  } else if (settled.status === "awaiting_information") {
    await addEvents(db, incidentId, [
      { actor: "agent", agentId, title: "Evidence Agent: information needed", detail: settled.currentTask, tone: "warning" },
    ])
    if (status === "action_plan_ready") {
      await db.incident.update({ where: { id: incidentId }, data: { status: "user_action_required" } })
    }
  }
}
