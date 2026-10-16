/**
 * Server-side agent orchestration.
 *
 * Today this runs the deterministic playbooks (engine = "mock"). Microsoft
 * Foundry slots in here later: replace `buildFindings` / `buildActionItems` with
 * real agent calls and record `engine: "foundry"` on the run.
 */
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { CASE_STATUSES } from "@/lib/config/taxonomy"
import { buildActionItems, buildFindings, idleAgentState, RUNNING_TASKS, settleAgentStatus } from "@/lib/playbooks"
import { addEvents, loadContext, type NewEvent } from "@/server/context"
import { type DbTx, prisma } from "@/server/db"
import type { AgentId, CaseStatus } from "@/types"

const STEP_MS = Number(process.env.ANALYSIS_STEP_MS ?? 1400)
/** A run still "running" after this long was interrupted (e.g. a server restart). */
const STALE_RUN_MS = Math.max(60_000, STEP_MS * AGENT_ORDER.length * 4)
const PRESERVED_STATUSES: CaseStatus[] = ["reporting_in_progress", "resolved", "archived"]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* Writes shared by runs and refreshes                                 */
/* ------------------------------------------------------------------ */

async function writeFindings(db: DbTx, incidentId: string, agentId: AgentId, runId: string | null, at: Date) {
  const ctx = await loadContext(db, incidentId)
  if (!ctx) return undefined
  await db.agentFinding.deleteMany({ where: { incidentId, agentId } })
  await db.agentFinding.createMany({
    data: buildFindings(agentId, ctx).map((f, position) => ({
      incidentId,
      agentId,
      runId,
      position,
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
  const { run, previousStatus } = await prisma.$transaction(async (tx) => {
    const incident = await tx.incident.findUniqueOrThrow({ where: { id: incidentId } })
    // A newer run supersedes any run in progress.
    await tx.analysisRun.updateMany({
      where: { incidentId, status: "running" },
      data: { status: "cancelled", completedAt: new Date() },
    })
    const run = await tx.analysisRun.create({ data: { incidentId, engine: "mock" } })
    await tx.agentFinding.deleteMany({ where: { incidentId } })
    await resetAgentStates(tx, incidentId)
    await tx.incident.update({ where: { id: incidentId }, data: { status: "analysis_in_progress" } })
    await addEvents(tx, incidentId, [
      { actor: "system", title: "Simulated analysis started", detail: "Demo workflow — no AI model is called", tone: "info" },
    ])
    const previousStatus: CaseStatus = incident.status === "analysis_in_progress" ? "reported" : incident.status
    return { run, previousStatus }
  })

  return () => executeRun(run.id, incidentId, previousStatus)
}

async function isLive(runId: string) {
  const run = await prisma.analysisRun.findUnique({ where: { id: runId }, select: { status: true } })
  return run?.status === "running"
}

async function executeRun(runId: string, incidentId: string, previousStatus: CaseStatus) {
  try {
    for (const agentId of AGENT_ORDER) {
      if (!(await isLive(runId))) return
      await prisma.agentState.update({
        where: { incidentId_agentId: { incidentId, agentId } },
        data: { status: "analyzing", currentTask: RUNNING_TASKS[agentId], startedAt: new Date(), completedAt: null },
      })
      await sleep(STEP_MS)
      if (!(await isLive(runId))) return

      await prisma.$transaction(async (tx) => {
        const events: NewEvent[] = []
        // The Containment Agent is the one that produces the action plan.
        if (agentId === "containment") {
          const added = await addMissingActions(tx, incidentId)
          if (added > 0) {
            events.push({
              actor: "agent",
              agentId,
              title: "Action plan generated",
              detail: `${added} suggested steps`,
              tone: "info",
            })
          }
        }
        const at = new Date()
        const ctx = await writeFindings(tx, incidentId, agentId, runId, at)
        if (!ctx) return
        const settled = settleAgentStatus(agentId, ctx)
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
    }

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
      await tx.analysisRun.update({ where: { id: runId }, data: { status: "completed", completedAt: new Date() } })
      await addEvents(tx, incidentId, [
        { actor: "system", title: "Case ready for your review", detail: CASE_STATUSES[nextStatus].label, tone: "success" },
      ])
    })
  } catch (error) {
    // The incident may have been deleted mid-run (e.g. a demo reset); that's not an error worth surfacing.
    const stillExists = await prisma.incident.count({ where: { id: incidentId } }).catch(() => 0)
    if (!stillExists) return
    console.error("[analysis] run failed", runId, error)
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
    where: { status: "running", startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) }, incident: { userId } },
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
  const ctx = await writeFindings(db, incidentId, agentId, null, at)
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
