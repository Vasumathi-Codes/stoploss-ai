import type { DbTx } from "@/server/db"
import { prisma } from "@/server/db"
import { loadGraph } from "@/server/evidence-store"
import { toAction, toEvidence, toIncident } from "@/server/mappers"
import { SAMPLE_PROFILE } from "@/server/seed"
import { digestGraph } from "@/lib/evidence/digest"
import type { AnalysisContext } from "@/lib/playbooks"
import type { CaseTimelineEvent } from "@/types"

/**
 * There is no authentication yet, so every request acts as the single demo user
 * (the oldest user row, created on first use). Replace this with a session
 * lookup when auth is added.
 */
export async function getCurrentUser(db: DbTx = prisma) {
  const existing = await db.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (existing) return existing
  return db.user.upsert({
    where: { email: SAMPLE_PROFILE.email },
    update: {},
    create: SAMPLE_PROFILE,
  })
}

export type NewEvent = Omit<CaseTimelineEvent, "id" | "incidentId" | "at">

/** Inserts events in order. Each gets its own millisecond so ordering is stable. */
export async function addEvents(db: DbTx, incidentId: string, events: NewEvent[]) {
  if (events.length === 0) return
  const base = Date.now()
  await db.timelineEvent.createMany({
    data: events.map((e, i) => ({
      incidentId,
      at: new Date(base + i),
      actor: e.actor,
      agentId: e.agentId,
      title: e.title,
      detail: e.detail,
      tone: e.tone ?? "neutral",
    })),
  })
}

/** Loads an incident and its data in UI shape, as the playbooks expect. */
export async function loadContext(db: DbTx, incidentId: string): Promise<AnalysisContext | undefined> {
  const row = await db.incident.findUnique({
    where: { id: incidentId },
    include: { notes: true, evidence: true, actions: { orderBy: { createdAt: "asc" } } },
  })
  if (!row) return undefined
  return {
    incident: toIncident(row),
    evidence: row.evidence.map(toEvidence),
    actions: row.actions.map(toAction),
    evidenceDigest: digestGraph(await loadGraph(db, incidentId)),
  }
}
