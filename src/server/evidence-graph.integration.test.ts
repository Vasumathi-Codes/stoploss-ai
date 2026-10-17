/**
 * Evidence Intelligence against a real PostgreSQL database (the local Docker one).
 * Skipped unless EVIDENCE_DB_TESTS=1 — run with `npm run test:db` after `npm run db:deploy`.
 *
 * Creates its own fictional users and cases and deletes them afterwards; the demo user's data is
 * not touched. Foundry is never called.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"

import type { FactNode, TransactionNode } from "@/lib/evidence/types"
import { READING_01, statementLines } from "@/lib/evidence/testing"
import type { AnalyzeSource } from "@/lib/validation/evidence-graph"

const enabled = process.env.EVIDENCE_DB_TESTS === "1"

describe("Evidence Intelligence with PostgreSQL", { skip: !enabled && "set EVIDENCE_DB_TESTS=1 (npm run test:db)" }, async () => {
  // Loaded lazily so the default `npm test` never needs DATABASE_URL.
  const { prisma } = await import("@/server/db")
  const { createIncident, removeEvidence, updateIncident } = await import("@/server/cases")
  const { analyzeEvidence, getEvidenceGraph, reviewFact } = await import("@/server/evidence-graph")
  const { rememberReading } = await import("@/server/screenshot-readings")
  const { HttpError } = await import("@/server/errors")

  const userIds: string[] = []
  let userA = ""
  let userB = ""
  let caseA = ""
  let caseB = ""
  let shotA = ""
  let stmtA = ""
  let chatA = ""
  let shotB = ""

  const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code

  const newUser = async (label: string) => {
    const u = await prisma.user.create({
      data: { email: `it-${label}-${randomUUID()}@example.invalid`, displayName: `Test ${label}` },
    })
    userIds.push(u.id)
    return u.id
  }

  const newCase = async (userId: string) =>
    createIncident(userId, {
      category: "upi_payment",
      title: "Fictional test case",
      description: "A fictional buyer sent a UPI request; it was approved and money was debited. Test data only.",
      amount: 18000,
      currency: "INR",
      occurredAt: "2026-10-15T08:30:00.000Z",
      paymentMethod: "UPI app",
      hasAccountAccess: "yes",
      evidence: [
        { name: "01-bank-debit-sms.png", mimeType: "image/png", size: 1000 },
        { name: "bank-statement-oct-2026.pdf", mimeType: "application/pdf", size: 2000 },
        { name: "scam-chat-export.txt", mimeType: "text/plain", size: 800 },
      ],
    })

  const statementSource = (evidenceId: string, amount = "18,500.00"): AnalyzeSource => ({
    type: "bank_statement",
    evidenceId,
    lines: statementLines([["15-10-2026", "UPI/quickbuyer77@okdemo/collect", "528104779213", amount, ""]]),
  })
  const screenshotSource = (evidenceId: string, userId = userA, reading = READING_01): AnalyzeSource => ({
    type: "screenshot_reading",
    evidenceId,
    readingId: rememberReading(userId, evidenceId, reading, "test-model · prompt test"),
  })
  const chatSource = (evidenceId: string): AnalyzeSource => ({
    type: "chat_export",
    evidenceId,
    messages: [
      {
        index: 4,
        text: "[15/10/26, 14:36:30] Buyer: Request sent from quickbuyer77@okdemo. Enter your UPI PIN to receive Rs 18,500",
      },
    ],
  })
  const facts = (g: { nodes: { type: string }[] }) => g.nodes.filter((n): n is FactNode => n.type === "fact")
  const txs = (g: { nodes: { type: string }[] }) => g.nodes.filter((n): n is TransactionNode => n.type === "transaction")

  before(async () => {
    userA = await newUser("a")
    userB = await newUser("b")
    const a = await newCase(userA)
    const b = await newCase(userB)
    caseA = a.incidentId
    caseB = b.incidentId
    ;[shotA, stmtA, chatA] = a.evidenceIds
    shotB = b.evidenceIds[0]
  })

  after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it("mirrors the case form before any evidence is analysed", async () => {
    const g = await getEvidenceGraph(userA, caseA)
    assert.equal(g.summary.evidenceFiles, 3)
    assert.equal(g.processingStatus.state, "not_processed")
    assert.ok(facts(g).every((f) => f.sourceType === "case_details"))
    assert.equal(g.missingEvidence.filter((m) => m.id.startsWith("unprocessed:")).length, 3)
  })

  it("builds a corroborated transaction from screenshot, statement and chat", async () => {
    const { graph } = await analyzeEvidence(userA, caseA, [screenshotSource(shotA), statementSource(stmtA), chatSource(chatA)])
    const t = txs(graph).find((x) => x.status === "corroborated")
    assert.ok(t, "screenshot and statement corroborate")
    assert.equal(t.sourceCount, 2)
    assert.ok(graph.edges.some((e) => e.relation === "related_context" && e.target === t.id))
    assert.equal(graph.processingStatus.state, "complete")
    const stored = await prisma.evidenceItem.findMany({ where: { incidentId: caseA } })
    assert.ok(stored.every((e) => e.processingStatus === "processed"))
    // Only metadata and screened facts are stored: no message text, no file bytes.
    const values = (await prisma.evidenceFact.findMany({ where: { incidentId: caseA } })).map(
      (f) => `${f.rawValue} ${f.normalizedValue}`,
    )
    assert.ok(values.every((v) => !/Enter your|Buyer/.test(v)))
  })

  it("is idempotent: analysing the same sources again changes nothing", async () => {
    const before = await snapshotIds(caseA)
    const { changed } = await analyzeEvidence(userA, caseA, [screenshotSource(shotA), statementSource(stmtA), chatSource(chatA)])
    assert.equal(changed, 0)
    assert.deepEqual(await snapshotIds(caseA), before)
  })

  it("survives concurrent analysis requests without duplicates", async () => {
    const before = await snapshotIds(caseA)
    await Promise.all([
      analyzeEvidence(userA, caseA, [statementSource(stmtA)]),
      analyzeEvidence(userA, caseA, [statementSource(stmtA)]),
      getEvidenceGraph(userA, caseA),
    ])
    assert.deepEqual(await snapshotIds(caseA), before)
  })

  it("rebuilds the same graph after a refresh", async () => {
    const a = await getEvidenceGraph(userA, caseA)
    const b = await getEvidenceGraph(userA, caseA)
    assert.deepEqual(
      a.nodes.map((n) => n.id),
      b.nodes.map((n) => n.id),
    )
    assert.deepEqual(
      a.edges.map((e) => e.id),
      b.edges.map((e) => e.id),
    )
  })

  it("keeps a confirmation across re-analysis, and flags it when the extracted value changes", async () => {
    let g = await getEvidenceGraph(userA, caseA)
    const amount = facts(g).find((f) => f.evidenceId === stmtA && f.factType === "amount")!
    g = await reviewFact(userA, caseA, amount.factId, { action: "confirm", expectedUpdatedAt: amount.updatedAt })
    assert.equal(facts(g).find((f) => f.factId === amount.factId)!.reviewStatus, "user_confirmed")

    await analyzeEvidence(userA, caseA, [statementSource(stmtA)])
    g = await getEvidenceGraph(userA, caseA)
    assert.equal(facts(g).find((f) => f.factId === amount.factId)!.reviewStatus, "user_confirmed", "same value: kept")

    await analyzeEvidence(userA, caseA, [statementSource(stmtA, "18,000.00")])
    g = await getEvidenceGraph(userA, caseA)
    const changed = facts(g).find((f) => f.factId === amount.factId)!
    assert.equal(changed.reviewStatus, "needs_verification")
    assert.equal(changed.displayStatus, "conflicted", "and the new value conflicts with the screenshot")
    const audit = await prisma.evidenceReviewEvent.findMany({ where: { factId: amount.factId }, orderBy: { createdAt: "asc" } })
    assert.deepEqual(
      audit.map((a) => a.action),
      ["confirm", "reextracted_changed"],
    )
  })

  it("keeps a conflict open until reviewed, and reopens on new data", async () => {
    let g = await getEvidenceGraph(userA, caseA)
    const conflict = g.conflicts.find((c) => c.factType === "amount" && c.reviewStatus === "open")!
    assert.ok(conflict)
    g = await reviewFact(userA, caseA, conflict.sides[0].factId, { action: "review_conflict", matchId: conflict.matchId })
    assert.equal(g.conflicts.find((c) => c.matchId === conflict.matchId)!.reviewStatus, "reviewed")

    await analyzeEvidence(userA, caseA, [statementSource(stmtA, "18,000.00")])
    g = await getEvidenceGraph(userA, caseA)
    assert.equal(g.conflicts.find((c) => c.matchId === conflict.matchId)!.reviewStatus, "reviewed", "same data: review kept")

    await analyzeEvidence(userA, caseA, [statementSource(stmtA, "17,500.00")])
    g = await getEvidenceGraph(userA, caseA)
    assert.ok(
      g.conflicts.some((c) => c.factType === "amount" && c.reviewStatus === "open"),
      "different data: a new, open conflict",
    )
  })

  it("records corrections beside the extracted value and re-matches", async () => {
    let g = await getEvidenceGraph(userA, caseA)
    const amount = facts(g).find((f) => f.evidenceId === stmtA && f.factType === "amount")!
    g = await reviewFact(userA, caseA, amount.factId, { action: "correct", value: "18,500.00" })
    const corrected = facts(g).find((f) => f.factId === amount.factId)!
    assert.equal(corrected.reviewStatus, "user_corrected")
    assert.equal(corrected.rawValue, "INR 17500.00", "the extracted value is preserved")
    assert.equal(g.conflicts.filter((c) => c.factType === "amount" && c.reviewStatus === "open").length, 0)
  })

  it("rejects unsupported or stale review actions", async () => {
    const g = await getEvidenceGraph(userA, caseA)
    const event = facts(g).find((f) => f.factType === "message_event")!
    await assert.rejects(reviewFact(userA, caseA, event.factId, { action: "correct", value: "x" }), status(422))
    const caseFact = facts(g).find((f) => f.sourceType === "case_details")!
    await assert.rejects(reviewFact(userA, caseA, caseFact.factId, { action: "confirm" }), status(409))
    const ref = facts(g).find((f) => f.factType === "transaction_reference" && f.evidenceId === shotA)!
    await assert.rejects(
      reviewFact(userA, caseA, ref.factId, { action: "reject", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }),
      status(409),
    )
    await assert.rejects(reviewFact(userA, caseA, ref.factId, { action: "review_conflict", matchId: randomUUID() }), status(404))
    await assert.rejects(reviewFact(userA, caseA, randomUUID(), { action: "confirm" }), status(404))
  })

  it("blocks cross-case and cross-user access", async () => {
    const g = await getEvidenceGraph(userA, caseA)
    const fact = facts(g).find((f) => f.evidenceId === shotA)!
    await assert.rejects(getEvidenceGraph(userB, caseA), status(404), "another user's case")
    await assert.rejects(analyzeEvidence(userB, caseA, []), status(404))
    await assert.rejects(reviewFact(userB, caseA, fact.factId, { action: "confirm" }), status(404))
    await assert.rejects(
      reviewFact(userB, caseB, fact.factId, { action: "confirm" }),
      status(404),
      "a fact from another case via my case",
    )
    await assert.rejects(
      analyzeEvidence(userA, caseA, [screenshotSource(shotB, userA)]),
      status(404),
      "evidence from another case",
    )
    await assert.rejects(
      analyzeEvidence(userA, caseA, [
        { type: "screenshot_reading", evidenceId: shotA, readingId: rememberReading(userB, shotA, READING_01, "v") },
      ]),
      status(409),
      "a reading made by someone else",
    )
    await assert.rejects(
      analyzeEvidence(userA, caseA, [{ ...statementSource(stmtA), evidenceId: shotA }]),
      status(422),
      "wrong file kind",
    )
  })

  it("re-matches when the case details change and when evidence is removed", async () => {
    await updateIncident(userA, caseA, { transactionRef: "528104779213" })
    let g = await getEvidenceGraph(userA, caseA)
    const caseRef = facts(g).find((f) => f.sourceType === "case_details" && f.factType === "transaction_reference")!
    assert.ok(caseRef.transactionId, "the reported reference now joins the evidence transaction")

    await removeEvidence(userA, stmtA)
    g = await getEvidenceGraph(userA, caseA)
    assert.equal(facts(g).filter((f) => f.evidenceId === stmtA).length, 0, "facts deleted with their evidence")
    assert.equal(g.conflicts.filter((c) => c.sides.some((s) => s.evidenceId === stmtA)).length, 0)
  })

  async function snapshotIds(incidentId: string) {
    const [f, c, m] = await Promise.all([
      prisma.evidenceFact.findMany({ where: { incidentId }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
      prisma.transactionCandidate.findMany({ where: { incidentId }, select: { id: true }, orderBy: { id: "asc" } }),
      prisma.evidenceMatch.findMany({ where: { incidentId }, select: { id: true }, orderBy: { id: "asc" } }),
    ])
    return {
      facts: f.map((x) => `${x.id}@${x.updatedAt.toISOString()}`),
      candidates: c.map((x) => x.id),
      matches: m.map((x) => x.id),
    }
  }
})
