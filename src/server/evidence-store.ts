/**
 * Evidence Intelligence persistence: idempotent fact upserts, reconciliation (deterministic
 * matching → stored candidates and matches) and loading the graph.
 *
 * Deliberately free of agent imports so `src/server/context.ts` can load the graph for the agents.
 * Every write path runs inside a transaction holding a per-case advisory lock, so concurrent
 * analyses of one case are serialised and can't create duplicates.
 */
import type * as Db from "@/generated/prisma/client"
import { buildEvidenceGraph, type GraphFactInput, toEngineFact } from "@/lib/evidence/graph"
import { runMatching } from "@/lib/evidence/matching"
import { factsFromCase } from "@/lib/evidence/sources"
import type { EvidenceGraph, ExtractedFact } from "@/lib/evidence/types"
import type { DbTx } from "@/server/db"

/** Serialises Evidence Intelligence writes for one case. Must run inside a transaction. */
export async function lockCase(db: DbTx, incidentId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evidence-graph:${incidentId}`}))`
}

export function toGraphFact(f: Db.EvidenceFact): GraphFactInput {
  return {
    id: f.id,
    evidenceId: f.evidenceId,
    transactionId: f.transactionId,
    factKey: f.factKey,
    recordKey: f.recordKey,
    recordRole: f.recordRole,
    factType: f.factType,
    sourceType: f.sourceType,
    extractionMethod: f.extractionMethod,
    extractorVersion: f.extractorVersion,
    rawValue: f.rawValue,
    normalizedValue: f.normalizedValue,
    correctedValue: f.correctedValue,
    // Amounts are capped at 10^11 paise upstream, well within Number's exact integer range.
    amountMinor: f.amountMinor === null ? null : Number(f.amountMinor),
    currency: f.currency,
    occurredAt: f.occurredAt?.toISOString() ?? null,
    timePrecision: f.timePrecision,
    sourceLocation: f.sourceLocation,
    reviewStatus: f.reviewStatus,
    updatedAt: f.updatedAt.toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

const valueColumns = (f: ExtractedFact) => ({
  normalizedValue: f.normalizedValue,
  amountMinor: f.amountMinor === undefined ? null : BigInt(f.amountMinor),
  currency: f.currency ?? null,
  occurredAt: f.occurredAt ? new Date(f.occurredAt) : null,
  timePrecision: f.timePrecision ?? null,
})

const metaColumns = (f: ExtractedFact) => ({
  recordKey: f.recordKey,
  recordRole: f.recordRole,
  factType: f.factType,
  sourceType: f.sourceType,
  extractionMethod: f.extractionMethod,
  extractorVersion: f.extractorVersion ?? null,
  rawValue: f.rawValue,
  sourceLocation: f.sourceLocation ?? null,
})

function sameValue(row: Db.EvidenceFact, f: ExtractedFact) {
  const v = valueColumns(f)
  return (
    row.normalizedValue === v.normalizedValue &&
    row.amountMinor === v.amountMinor &&
    row.currency === v.currency &&
    (row.occurredAt?.getTime() ?? null) === (v.occurredAt?.getTime() ?? null) &&
    row.timePrecision === v.timePrecision
  )
}

function sameMeta(row: Db.EvidenceFact, f: ExtractedFact) {
  const m = metaColumns(f)
  return (Object.keys(m) as (keyof typeof m)[]).every((k) => row[k] === m[k])
}

/**
 * Replaces one source's facts idempotently. Rules:
 * - a fact with the same key and value is left alone (its review is kept, updatedAt unchanged);
 * - a changed value is updated; if the person had reviewed it, the review becomes
 *   "needs verification" (a correction they typed is kept) and an audit event is written;
 * - facts the source no longer yields are deleted unless the person reviewed them.
 * Case-form facts (evidenceId null) mirror the form, so they are always replaced.
 */
export async function upsertSourceFacts(db: DbTx, incidentId: string, evidenceId: string | null, facts: ExtractedFact[]) {
  const existing = await db.evidenceFact.findMany({ where: { incidentId, evidenceId } })
  const byKey = new Map(existing.map((f) => [f.factKey, f]))
  const seen = new Set<string>()
  let changed = 0

  for (const f of facts) {
    if (seen.has(f.factKey)) continue
    seen.add(f.factKey)
    const row = byKey.get(f.factKey)
    if (!row) {
      await db.evidenceFact.create({
        data: { incidentId, evidenceId, factKey: f.factKey, ...metaColumns(f), ...valueColumns(f) },
      })
      changed++
      continue
    }
    if (sameValue(row, f)) {
      if (!sameMeta(row, f)) await db.evidenceFact.update({ where: { id: row.id }, data: metaColumns(f) })
      continue
    }
    const reviewed = row.reviewStatus !== "unreviewed"
    const keepCorrection = row.reviewStatus === "user_corrected"
    await db.evidenceFact.update({
      where: { id: row.id },
      data: {
        ...metaColumns(f),
        ...valueColumns(f),
        ...(reviewed && !keepCorrection ? { reviewStatus: "needs_verification" } : {}),
      },
    })
    if (reviewed) {
      await db.evidenceReviewEvent.create({
        data: {
          incidentId,
          factId: row.id,
          action: "reextracted_changed",
          actor: "system",
          fromStatus: row.reviewStatus,
          toStatus: keepCorrection ? row.reviewStatus : "needs_verification",
        },
      })
    }
    changed++
  }

  const stale = existing.filter((f) => !seen.has(f.factKey) && (evidenceId === null || f.reviewStatus === "unreviewed"))
  if (stale.length > 0) await db.evidenceFact.deleteMany({ where: { id: { in: stale.map((f) => f.id) } } })
  return { changed: changed + stale.length, total: seen.size }
}

/** Mirrors the case form into case-detail facts. */
export async function syncCaseFacts(db: DbTx, incidentId: string) {
  const incident = await db.incident.findUnique({ where: { id: incidentId } })
  if (!incident) return
  await upsertSourceFacts(
    db,
    incidentId,
    null,
    factsFromCase({
      amount: incident.amount.toNumber(),
      currency: incident.currency,
      occurredAt: incident.occurredAt.toISOString(),
      paymentMethod: incident.paymentMethod,
      transactionRef: incident.transactionRef ?? undefined,
      counterparty: incident.counterparty ?? undefined,
    }),
  )
}

/* ------------------------------------------------------------------ */
/* Reconciliation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Re-runs deterministic matching over the case's stored facts and persists the result.
 * Writes only what changed, so repeated runs are no-ops. Match reviews survive because a
 * match keeps its key while its facts and values are unchanged; a changed value produces a
 * new key, i.e. a new, open conflict — never a silently "resolved" one.
 */
export async function reconcileEvidence(db: DbTx, incidentId: string) {
  await lockCase(db, incidentId)
  await syncCaseFacts(db, incidentId)
  const rows = await db.evidenceFact.findMany({ where: { incidentId } })
  const out = runMatching(rows.map((r) => toEngineFact(toGraphFact(r))))

  // Candidates.
  const keys = out.candidates.map((c) => c.key)
  await db.transactionCandidate.deleteMany({ where: { incidentId, candidateKey: { notIn: keys } } })
  if (keys.length > 0)
    await db.transactionCandidate.createMany({
      data: keys.map((candidateKey) => ({ incidentId, candidateKey })),
      skipDuplicates: true,
    })
  const candidates = await db.transactionCandidate.findMany({ where: { incidentId } })
  const idByKey = new Map(candidates.map((c) => [c.candidateKey, c.id]))

  // Fact → candidate, only where it changed (so updatedAt stays meaningful for stale-write checks).
  const target = new Map<string | null, string[]>()
  for (const r of rows) {
    const key = out.factCandidate.get(r.id)
    const id = key ? (idByKey.get(key) ?? null) : null
    if (r.transactionId === id) continue
    const list = target.get(id)
    if (list) list.push(r.id)
    else target.set(id, [r.id])
  }
  for (const [transactionId, ids] of target) {
    await db.evidenceFact.updateMany({ where: { id: { in: ids } }, data: { transactionId } })
  }

  // Matches.
  const existing = await db.evidenceMatch.findMany({ where: { incidentId } })
  const fresh = new Map(out.results.map((r) => [r.key, r]))
  const staleIds = existing.filter((m) => !fresh.has(m.matchKey)).map((m) => m.id)
  if (staleIds.length > 0) await db.evidenceMatch.deleteMany({ where: { id: { in: staleIds } } })
  const byKey = new Map(existing.map((m) => [m.matchKey, m]))
  const toCreate = []
  for (const r of out.results) {
    const transactionId = r.candidateKey ? (idByKey.get(r.candidateKey) ?? null) : null
    const data = {
      ruleId: r.ruleId,
      outcome: r.outcome,
      relation: r.relation,
      factAId: r.factAId,
      factBId: r.factBId,
      transactionId,
      explanation: r.explanation,
      uncertainty: r.uncertainty ?? null,
      requiresReview: r.requiresReview,
    }
    const row = byKey.get(r.key)
    if (!row) toCreate.push({ incidentId, matchKey: r.key, ...data })
    else if ((Object.keys(data) as (keyof typeof data)[]).some((k) => row[k] !== data[k]))
      await db.evidenceMatch.update({ where: { id: row.id }, data })
  }
  if (toCreate.length > 0) await db.evidenceMatch.createMany({ data: toCreate, skipDuplicates: true })
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/** The graph from persisted rows: four queries, no per-node lookups. */
export async function loadGraph(db: DbTx, incidentId: string): Promise<EvidenceGraph> {
  const [evidence, facts, candidates, matches] = await Promise.all([
    db.evidenceItem.findMany({ where: { incidentId }, orderBy: { addedAt: "asc" } }),
    db.evidenceFact.findMany({ where: { incidentId } }),
    db.transactionCandidate.findMany({ where: { incidentId } }),
    db.evidenceMatch.findMany({ where: { incidentId } }),
  ])
  return buildEvidenceGraph({
    caseId: incidentId,
    generatedAt: new Date().toISOString(),
    evidence: evidence.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      mimeType: e.mimeType,
      size: e.size,
      addedAt: e.addedAt.toISOString(),
      processingStatus: e.processingStatus,
      processingError: e.processingError,
    })),
    facts: facts.map(toGraphFact),
    candidates: candidates.map((c) => ({ id: c.id, candidateKey: c.candidateKey })),
    matches: matches.map((m) => ({
      id: m.id,
      ruleId: m.ruleId,
      outcome: m.outcome,
      relation: m.relation,
      factAId: m.factAId,
      factBId: m.factBId,
      transactionId: m.transactionId,
      explanation: m.explanation,
      uncertainty: m.uncertainty,
      requiresReview: m.requiresReview,
      reviewStatus: m.reviewStatus,
    })),
  })
}
