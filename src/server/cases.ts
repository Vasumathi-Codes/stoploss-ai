/**
 * Case, evidence, action-plan and profile operations. Every function is scoped
 * to a user id and checks ownership before writing.
 */
import { CASE_STATUSES } from "@/lib/config/taxonomy"
import { createCaseReference } from "@/lib/utils/ids"
import type { CreateIncidentBody, EvidenceMeta } from "@/lib/validation/api"
import { refreshAgent, recoverStaleRuns, resetAgentStates } from "@/server/analysis"
import { addEvents } from "@/server/context"
import { type DbTx, prisma } from "@/server/db"
import { getFoundryConfig } from "@/server/foundry/client"
import { notFound } from "@/server/http"
import {
  toAction,
  toAgentStates,
  toEvidence,
  toFinding,
  toIncident,
  toProfile,
  toResource,
  toTimelineEvent,
} from "@/server/mappers"
import type { AppSnapshot } from "@/lib/services/types"
import type { ActionStatus, CaseStatus, EvidenceKind, UserProfile } from "@/types"

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/** Everything the UI needs for one user, in UI shape. */
export async function getSnapshot(userId: string): Promise<AppSnapshot> {
  await recoverStaleRuns(userId)
  const mine = { incident: { userId } }
  const [user, incidents, evidence, actions, findings, timeline, agentStates, resources, running, latestRuns] = await Promise.all(
    [
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.incident.findMany({
        where: { userId },
        include: { notes: { orderBy: { createdAt: "asc" } } },
        orderBy: { reportedAt: "desc" },
      }),
      prisma.evidenceItem.findMany({ where: mine, orderBy: { addedAt: "desc" } }),
      prisma.actionItem.findMany({ where: mine, orderBy: { createdAt: "asc" } }),
      prisma.agentFinding.findMany({ where: mine, orderBy: [{ agentId: "asc" }, { position: "asc" }] }),
      prisma.timelineEvent.findMany({ where: mine, orderBy: { at: "desc" }, take: 500 }),
      prisma.agentState.findMany({ where: mine }),
      prisma.officialResource.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.analysisRun.findMany({ where: { ...mine, status: "running" }, select: { incidentId: true } }),
      prisma.analysisRun.findMany({
        where: mine,
        orderBy: { startedAt: "desc" },
        distinct: ["incidentId"],
        select: { incidentId: true, engine: true },
      }),
    ],
  )
  const foundry = getFoundryConfig()
  return {
    profile: toProfile(user),
    incidents: incidents.map(toIncident),
    evidence: evidence.map(toEvidence),
    actions: actions.map(toAction),
    findings: findings.map(toFinding),
    timeline: timeline.map(toTimelineEvent),
    agentStates: toAgentStates(agentStates),
    resources: resources.map(toResource),
    readEventIds: timeline.filter((e) => e.readAt).map((e) => e.id),
    runningIncidentIds: [...new Set(running.map((r) => r.incidentId))],
    analysis: foundry ? { engine: "foundry", model: foundry.deployment } : { engine: "mock" },
    incidentEngines: Object.fromEntries(latestRuns.map((r) => [r.incidentId, r.engine])),
  }
}

async function ownedIncident(db: DbTx, userId: string, incidentId: string) {
  const incident = await db.incident.findFirst({ where: { id: incidentId, userId } })
  if (!incident) throw notFound("Case")
  return incident
}

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

export function evidenceKindFor(mime: string): EvidenceKind {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/plain") return "text"
  return "other"
}

async function insertEvidence(db: DbTx, incidentId: string, files: EvidenceMeta[]) {
  const base = Date.now()
  // Created one by one so the ids come back in the same order as `files`.
  const rows = []
  for (const [i, f] of files.entries()) {
    rows.push(
      await db.evidenceItem.create({
        data: {
          incidentId,
          name: f.name,
          kind: evidenceKindFor(f.mimeType),
          mimeType: f.mimeType,
          size: f.size,
          description: f.description,
          addedAt: new Date(base + i),
        },
      }),
    )
  }
  await addEvents(
    db,
    incidentId,
    rows.map((r) => ({ actor: "user", title: "Evidence added", detail: r.name })),
  )
  return rows.map((r) => r.id)
}

async function uniqueReference(db: DbTx) {
  const now = new Date()
  const prefix = `SL-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-`
  const taken = await db.incident.findMany({ where: { reference: { startsWith: prefix } }, select: { reference: true } })
  return createCaseReference(new Set(taken.map((t) => t.reference)), now)
}

export async function createIncident(userId: string, input: CreateIncidentBody) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.incident.create({
      data: {
        userId,
        reference: await uniqueReference(tx),
        title: input.title,
        category: input.category,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        occurredAt: new Date(input.occurredAt),
        paymentMethod: input.paymentMethod,
        transactionRef: input.transactionRef || null,
        hasAccountAccess: input.hasAccountAccess,
        ongoing: input.ongoing,
        status: "reported",
      },
    })
    await resetAgentStates(tx, incident.id)
    await addEvents(tx, incident.id, [
      { actor: "user", title: "Incident details provided", detail: incident.title, tone: "info" },
    ])
    const evidenceIds = await insertEvidence(tx, incident.id, input.evidence)
    return { incidentId: incident.id, evidenceIds }
  })
}

export async function updateIncident(
  userId: string,
  incidentId: string,
  patch: { status?: CaseStatus; transactionRef?: string },
) {
  await prisma.$transaction(async (tx) => {
    const current = await ownedIncident(tx, userId, incidentId)
    await tx.incident.update({ where: { id: incidentId }, data: patch })
    if (patch.status && patch.status !== current.status) {
      await addEvents(tx, incidentId, [
        {
          actor: "user",
          title: `Status changed to ${CASE_STATUSES[patch.status].label}`,
          tone: patch.status === "resolved" ? "success" : "neutral",
        },
      ])
    }
    if (patch.transactionRef !== undefined && patch.transactionRef !== current.transactionRef) {
      await addEvents(tx, incidentId, [{ actor: "user", title: "Transaction reference added", tone: "info" }])
      for (const agentId of ["incident", "evidence", "recovery"] as const) await refreshAgent(tx, incidentId, agentId)
    }
  })
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export async function addNote(userId: string, incidentId: string, body: string) {
  await prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    await tx.caseNote.create({ data: { incidentId, body } })
    await tx.incident.update({ where: { id: incidentId }, data: { updatedAt: new Date() } })
    await addEvents(tx, incidentId, [{ actor: "user", title: "Note added" }])
  })
}

export async function removeNote(userId: string, incidentId: string, noteId: string) {
  await prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    const { count } = await tx.caseNote.deleteMany({ where: { id: noteId, incidentId } })
    if (count === 0) throw notFound("Note")
    await tx.incident.update({ where: { id: incidentId }, data: { updatedAt: new Date() } })
  })
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export async function addEvidence(userId: string, incidentId: string, files: EvidenceMeta[]) {
  return prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    const ids = await insertEvidence(tx, incidentId, files)
    await tx.incident.update({ where: { id: incidentId }, data: { updatedAt: new Date() } })
    await refreshAgent(tx, incidentId, "evidence")
    return ids
  })
}

export async function removeEvidence(userId: string, evidenceId: string) {
  await prisma.$transaction(async (tx) => {
    const item = await tx.evidenceItem.findFirst({ where: { id: evidenceId, incident: { userId } } })
    if (!item) throw notFound("Evidence item")
    await tx.evidenceItem.delete({ where: { id: evidenceId } })
    await tx.incident.update({ where: { id: item.incidentId }, data: { updatedAt: new Date() } })
    await addEvents(tx, item.incidentId, [{ actor: "user", title: "Evidence removed", detail: item.name }])
    await refreshAgent(tx, item.incidentId, "evidence")
  })
}

/* ------------------------------------------------------------------ */
/* Action plan                                                         */
/* ------------------------------------------------------------------ */

const STATUS_EVENT: Record<ActionStatus, { title: string; tone: "success" | "info" | "neutral" }> = {
  completed: { title: "Task marked complete", tone: "success" },
  in_progress: { title: "Task started", tone: "info" },
  pending: { title: "Task reopened", tone: "neutral" },
}

export async function setActionStatus(userId: string, actionId: string, status: ActionStatus) {
  await prisma.$transaction(async (tx) => {
    const action = await tx.actionItem.findFirst({ where: { id: actionId, incident: { userId } }, include: { incident: true } })
    if (!action) throw notFound("Action")
    if (action.status === status) return
    await tx.actionItem.update({
      where: { id: actionId },
      data: { status, completedAt: status === "completed" ? new Date() : null },
    })
    // Starting the official complaint moves the case into reporting.
    const startsReporting =
      action.key === "file-ncrp" &&
      status !== "pending" &&
      (action.incident.status === "action_plan_ready" || action.incident.status === "user_action_required")
    await tx.incident.update({
      where: { id: action.incidentId },
      data: startsReporting ? { status: "reporting_in_progress" } : { updatedAt: new Date() },
    })
    await addEvents(tx, action.incidentId, [{ actor: "user", ...STATUS_EVENT[status], detail: action.title }])
    await refreshAgent(tx, action.incidentId, "recovery")
  })
}

/* ------------------------------------------------------------------ */
/* Profile & notifications                                             */
/* ------------------------------------------------------------------ */

export async function updateProfile(userId: string, patch: Partial<UserProfile>) {
  await prisma.user.update({ where: { id: userId }, data: patch })
}

export async function markEventsRead(userId: string, ids: string[]) {
  await prisma.timelineEvent.updateMany({
    where: { id: { in: ids }, readAt: null, incident: { userId } },
    data: { readAt: new Date() },
  })
}

export async function assertOwnsIncident(userId: string, incidentId: string) {
  await ownedIncident(prisma, userId, incidentId)
}
