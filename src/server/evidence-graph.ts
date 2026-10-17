/**
 * Evidence Intelligence operations behind the API. Every function is scoped to a user and
 * checks that the case (and any evidence, fact or match id) belongs to them.
 */
import { parseChatExport, factsFromChat, type ChatMessage } from "@/lib/evidence/chat-parser"
import { FACT_TYPE_LABELS } from "@/lib/evidence/labels"
import { CORRECTABLE_TYPES, normalizeForType } from "@/lib/evidence/normalize"
import { factsFromScreenshot } from "@/lib/evidence/sources"
import { factsFromStatement, parseStatementLines } from "@/lib/evidence/statement-parser"
import type { EvidenceGraph, ExtractedFact, FactReviewStatus } from "@/lib/evidence/types"
import { type AnalyzeSource, type FactReviewBody, UNSUPPORTED_REASONS } from "@/lib/validation/evidence-graph"
import { refreshAgent } from "@/server/analysis"
import { addEvents } from "@/server/context"
import { type DbTx, prisma } from "@/server/db"
import { loadGraph, lockCase, reconcileEvidence, upsertSourceFacts } from "@/server/evidence-store"
import { HttpError, notFound } from "@/server/errors"
import { findReading } from "@/server/screenshot-readings"
import type { EvidenceKind } from "@/types"

const TX_OPTIONS = { timeout: 15_000 }

async function ownedIncident(db: DbTx, userId: string, incidentId: string) {
  const incident = await db.incident.findFirst({ where: { id: incidentId, userId }, select: { id: true } })
  if (!incident) throw notFound("Case")
}

/** Reads the graph. Reconciles derived records first (deterministic, no AI; writes only if something changed). */
export async function getEvidenceGraph(userId: string, incidentId: string): Promise<EvidenceGraph> {
  return prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    await reconcileEvidence(tx, incidentId)
    return loadGraph(tx, incidentId)
  }, TX_OPTIONS)
}

/** An evidence item the user owns, or 404. Used by the screenshot route before reading. */
export async function assertOwnsEvidence(userId: string, evidenceId: string, kind?: EvidenceKind) {
  const item = await prisma.evidenceItem.findFirst({ where: { id: evidenceId, incident: { userId } } })
  if (!item) throw notFound("Evidence item")
  if (kind && item.kind !== kind) throw new HttpError(422, "This evidence item can't be read this way")
  return item
}

/** Records a failed read with a safe message (never model output or file content). */
export async function markProcessingFailed(userId: string, evidenceId: string, message: string) {
  await prisma.evidenceItem.updateMany({
    where: { id: evidenceId, incident: { userId } },
    data: { processingStatus: "failed", processingError: message.slice(0, 200), processedAt: new Date() },
  })
}

const KIND_FOR: Record<Exclude<AnalyzeSource["type"], "unsupported">, EvidenceKind> = {
  screenshot_reading: "image",
  chat_export: "text",
  bank_statement: "pdf",
}

function factsFor(userId: string, source: Exclude<AnalyzeSource, { type: "unsupported" }>, evidenceId: string): ExtractedFact[] {
  switch (source.type) {
    case "screenshot_reading": {
      const pending = findReading(userId, evidenceId, source.readingId)
      if (!pending)
        throw new HttpError(409, "That screenshot reading has expired. Read the screenshot again to save its details.")
      return factsFromScreenshot(evidenceId, pending.reading, pending.extractorVersion)
    }
    case "chat_export": {
      // Each message is re-parsed on its own; the index is its position in the full export.
      const messages: ChatMessage[] = source.messages.flatMap((m) => {
        const parsed = parseChatExport(m.text).messages[0]
        return parsed ? [{ ...parsed, index: m.index }] : []
      })
      if (messages.length === 0) throw new HttpError(422, "No chat messages were recognised in what was sent.")
      return factsFromChat(evidenceId, messages)
    }
    case "bank_statement": {
      const { headerFound, transactions } = parseStatementLines(source.lines)
      if (!headerFound) throw new HttpError(422, "No statement table (Date / Debit / Credit) was found in what was sent.")
      return factsFromStatement(evidenceId, transactions)
    }
  }
}

/**
 * Ingests the given sources (each re-parsed and screened on the server), then re-runs matching.
 * With no sources it only reconciles. Idempotent: sending the same source twice changes nothing.
 */
export async function analyzeEvidence(userId: string, incidentId: string, sources: AnalyzeSource[]) {
  return prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    await lockCase(tx, incidentId)
    const ids = [...new Set(sources.map((s) => s.evidenceId))]
    // Scoped to this case: an id from another case is simply not found.
    const items = await tx.evidenceItem.findMany({ where: { incidentId, id: { in: ids } } })
    const byId = new Map(items.map((i) => [i.id, i]))

    let added = 0
    let files = 0
    for (const source of sources) {
      const item = byId.get(source.evidenceId)
      if (!item) throw notFound("Evidence item")
      if (source.type === "unsupported") {
        await tx.evidenceItem.update({
          where: { id: item.id },
          data: { processingStatus: "unsupported", processingError: UNSUPPORTED_REASONS[source.reason], processedAt: new Date() },
        })
        continue
      }
      if (item.kind !== KIND_FOR[source.type]) throw new HttpError(422, `${item.name} can't be analysed as that kind of source`)
      const facts = factsFor(userId, source, item.id)
      const { changed } = await upsertSourceFacts(tx, incidentId, item.id, facts)
      added += changed
      files++
      await tx.evidenceItem.update({
        where: { id: item.id },
        data: { processingStatus: facts.length > 0 ? "processed" : "no_facts", processingError: null, processedAt: new Date() },
      })
    }

    await reconcileEvidence(tx, incidentId)
    if (files > 0) {
      await addEvents(tx, incidentId, [
        {
          actor: "system",
          title: "Evidence Intelligence updated",
          detail: `${files} file${files === 1 ? "" : "s"} analysed. Extracted facts are unverified until you review them.`,
          tone: "info",
        },
      ])
      await tx.incident.update({ where: { id: incidentId }, data: { updatedAt: new Date() } })
    }
    await refreshAgent(tx, incidentId, "evidence")
    return { graph: await loadGraph(tx, incidentId), changed: added }
  }, TX_OPTIONS)
}

const FACT_ACTION_STATUS: Record<"confirm" | "reject" | "mark_needs_verification" | "reset", FactReviewStatus> = {
  confirm: "user_confirmed",
  reject: "user_rejected",
  mark_needs_verification: "needs_verification",
  reset: "unreviewed",
}

/**
 * Applies one of the supported review actions. Only these transitions exist; clients can't set
 * match outcomes, relationships, ownership, timestamps or arbitrary statuses.
 */
export async function reviewFact(userId: string, incidentId: string, factId: string, body: FactReviewBody) {
  return prisma.$transaction(async (tx) => {
    await ownedIncident(tx, userId, incidentId)
    await lockCase(tx, incidentId)
    const fact = await tx.evidenceFact.findFirst({ where: { id: factId, incidentId } })
    if (!fact) throw notFound("Fact")

    if ("matchId" in body) {
      const match = await tx.evidenceMatch.findFirst({
        where: { id: body.matchId, incidentId, OR: [{ factAId: factId }, { factBId: factId }] },
      })
      if (!match) throw notFound("Conflict")
      if (match.outcome !== "conflict") throw new HttpError(422, "Only conflicts can be marked as reviewed or deferred")
      const to = body.action === "review_conflict" ? "reviewed" : body.action === "defer_conflict" ? "deferred" : "open"
      if (match.reviewStatus !== to) {
        await tx.evidenceMatch.update({
          where: { id: match.id },
          data: { reviewStatus: to, reviewedAt: to === "open" ? null : new Date() },
        })
        await tx.evidenceReviewEvent.create({
          data: {
            incidentId,
            matchId: match.id,
            factId,
            action: body.action === "reopen_conflict" ? "reset" : body.action,
            fromStatus: match.reviewStatus,
            toStatus: to,
          },
        })
      }
    } else {
      if (fact.sourceType === "case_details")
        throw new HttpError(409, "Facts from the case form change when you edit the case, not here.")
      if (body.expectedUpdatedAt && fact.updatedAt.toISOString() !== body.expectedUpdatedAt)
        throw new HttpError(409, "This fact changed since you opened it. Refresh and try again.")

      let data: { reviewStatus: FactReviewStatus; correctedValue?: string | null }
      if (body.action === "correct") {
        if (!CORRECTABLE_TYPES.includes(fact.factType))
          throw new HttpError(422, `${FACT_TYPE_LABELS[fact.factType]} can be confirmed or rejected, not edited`)
        if (!normalizeForType(fact.factType, body.value, fact.currency ?? "INR"))
          throw new HttpError(422, `That isn't a valid ${FACT_TYPE_LABELS[fact.factType].toLowerCase()}`)
        // The extracted rawValue stays; the correction is stored beside it.
        data = { reviewStatus: "user_corrected", correctedValue: body.value }
      } else {
        if (body.action === "confirm" && fact.reviewStatus === "user_corrected")
          throw new HttpError(409, "You corrected this fact. Reset it first to confirm the extracted value.")
        data = { reviewStatus: FACT_ACTION_STATUS[body.action], ...(body.action === "reset" ? { correctedValue: null } : {}) }
      }
      await tx.evidenceFact.update({ where: { id: fact.id }, data: { ...data, reviewedAt: new Date() } })
      await tx.evidenceReviewEvent.create({
        data: { incidentId, factId: fact.id, action: body.action, fromStatus: fact.reviewStatus, toStatus: data.reviewStatus },
      })
    }

    await reconcileEvidence(tx, incidentId)
    await refreshAgent(tx, incidentId, "evidence")
    return loadGraph(tx, incidentId)
  }, TX_OPTIONS)
}
