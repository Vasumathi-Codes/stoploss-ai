/**
 * Evidence Intelligence server-side checks that need no database: request validation,
 * the pending-reading store, rate limiting, and what the Foundry agents receive and may say.
 * Foundry is always faked. Run with `npm test`.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { digestGraph } from "@/lib/evidence/digest"
import { factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { factsFromScreenshot } from "@/lib/evidence/sources"
import { asRows, evidenceRow, graphFrom, READING_01 } from "@/lib/evidence/testing"
import type { AnalysisContext } from "@/lib/playbooks"
import { buildFindings } from "@/lib/playbooks"
import { analyzeBodySchema, factReviewSchema } from "@/lib/validation/evidence-graph"
import { buildInput, parseAgentOutput } from "@/server/foundry/agents"
import { parseExtraction } from "@/server/foundry/extract"
import { HttpError, parseBody } from "@/server/errors"
import { takeSlot } from "@/server/rate-limit"
import { findReading, rememberReading } from "@/server/screenshot-readings"

const UUID = "00000000-0000-4000-a000-000000000001"
const OTHER = "00000000-0000-4000-a000-000000000002"

describe("review request validation", () => {
  it("accepts only the supported actions and strips anything else", () => {
    assert.ok(factReviewSchema.safeParse({ action: "confirm" }).success)
    assert.ok(factReviewSchema.safeParse({ action: "correct", value: "528104779213" }).success)
    assert.ok(factReviewSchema.safeParse({ action: "review_conflict", matchId: UUID }).success)
    for (const body of [
      { action: "set_status" },
      { action: "review_conflict" },
      { action: "review_conflict", matchId: "not-a-uuid" },
      { action: "correct" },
    ]) {
      assert.equal(factReviewSchema.safeParse(body).success, false, JSON.stringify(body))
    }
    // Clients can't smuggle in a status, outcome or ownership: unknown keys never reach the database.
    const smuggled = factReviewSchema.safeParse({
      action: "confirm",
      reviewStatus: "user_confirmed",
      outcome: "match",
      incidentId: OTHER,
    })
    assert.ok(smuggled.success)
    assert.deepEqual(smuggled.data, { action: "confirm" })
  })

  it("rejects secrets and card numbers in corrections", () => {
    assert.equal(factReviewSchema.safeParse({ action: "correct", value: "OTP is 482913" }).success, false)
    assert.equal(factReviewSchema.safeParse({ action: "correct", value: "4111 1111 1111 1111" }).success, false)
  })

  it("bounds analysis requests", () => {
    assert.ok(analyzeBodySchema.safeParse({}).success, "no sources = reconcile only")
    assert.equal(analyzeBodySchema.safeParse({ sources: [{ type: "screenshot_reading", evidenceId: UUID }] }).success, false)
    assert.equal(
      analyzeBodySchema.safeParse({
        sources: [{ type: "chat_export", evidenceId: UUID, messages: [{ index: 1, text: "x".repeat(5000) }] }],
      }).success,
      false,
    )
    assert.equal(
      analyzeBodySchema.safeParse({ sources: [{ type: "unsupported", evidenceId: UUID, reason: "anything" }] }).success,
      false,
    )
  })

  it("rejects oversized bodies with 413 before parsing", async () => {
    const big = new Request("http://x/", { method: "POST", body: JSON.stringify({ a: "x".repeat(2000) }) })
    await assert.rejects(parseBody(big, analyzeBodySchema, 1000), (e) => e instanceof HttpError && e.status === 413)
    const declared = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-length": "999999999" } })
    await assert.rejects(parseBody(declared, analyzeBodySchema, 1000), (e) => e instanceof HttpError && e.status === 413)
  })
})

describe("pending screenshot readings", () => {
  it("only returns a reading to the same user and evidence item", () => {
    const id = rememberReading("user-a", UUID, READING_01, "v")
    assert.ok(findReading("user-a", UUID, id))
    assert.equal(findReading("user-b", UUID, id), undefined, "another user")
    assert.equal(findReading("user-a", OTHER, id), undefined, "another evidence item")
    assert.equal(findReading("user-a", UUID, OTHER), undefined, "unknown id")
  })
})

describe("rate limiting", () => {
  it("allows up to the limit per window, per user", () => {
    const now = 1_000_000
    takeSlot("t", "u1", 2, "slow down", 60_000, now)
    takeSlot("t", "u1", 2, "slow down", 60_000, now + 1)
    assert.throws(
      () => takeSlot("t", "u1", 2, "slow down", 60_000, now + 2),
      (e) => e instanceof HttpError && e.status === 429,
    )
    takeSlot("t", "u2", 2, "slow down", 60_000, now + 2)
    takeSlot("t", "u1", 2, "slow down", 60_000, now + 60_001)
  })
})

describe("screenshot reader precision", () => {
  it("marks a date without a time as day precision", () => {
    const raw = (time: string | null) =>
      JSON.stringify({
        ...{
          isPaymentRecord: true,
          kind: "bank_sms",
          direction: "debit",
          amount: 1,
          currency: "INR",
          date: "2026-10-15",
          transactionRef: null,
          counterparty: null,
          paymentMethod: null,
          containsSensitiveData: false,
          note: null,
        },
        time,
      })
    const now = Date.parse("2026-10-17T06:00:00.000Z")
    assert.equal(parseExtraction(raw("14:52"), now).occurredAtPrecision, "minute")
    assert.equal(parseExtraction(raw(null), now).occurredAtPrecision, "day")
  })
})

function ctxWithGraph(): AnalysisContext {
  const SHOT = UUID
  const CHAT = OTHER
  const rows = [
    ...asRows(factsFromScreenshot(SHOT, READING_01, "v"), SHOT),
    ...asRows(
      factsFromChat(CHAT, parseChatExport("[15/10/26, 14:36:30] B: Request sent from quickbuyer77@okdemo").messages),
      CHAT,
    ),
  ]
  const graph = graphFrom(
    [evidenceRow(SHOT, "01-bank-debit-sms.png", "image"), evidenceRow(CHAT, "scam-chat-export.txt", "text")],
    rows,
  )
  return {
    incident: {
      id: "i1",
      reference: "SL-2610-0001",
      title: "Marketplace UPI request",
      category: "upi_payment",
      description: "A buyer sent a UPI request saying it was to receive money; I approved it and money was debited.",
      amount: 18500,
      currency: "INR",
      occurredAt: "2026-10-15T09:22:00.000Z",
      reportedAt: "2026-10-15T10:00:00.000Z",
      updatedAt: "2026-10-15T10:00:00.000Z",
      paymentMethod: "UPI app",
      transactionRef: "528104779213",
      counterparty: "quickbuyer77@okdemo",
      hasAccountAccess: "yes",
      status: "reported",
      notes: [],
      isSample: false,
    },
    evidence: [],
    actions: [],
    evidenceDigest: digestGraph(graph),
  }
}

describe("agent integration", () => {
  it("gives the Evidence and Incident agents the digest, never identifier values", () => {
    const ctx = ctxWithGraph()
    for (const agent of ["evidence", "incident", "recovery"] as const) {
      const input = buildInput(agent, ctx, [], [])
      assert.match(input, /evidenceIntelligence/)
      for (const value of ["528104779213", "quickbuyer77", "okdemo", "01-bank-debit-sms"])
        assert.ok(!input.includes(value), `${agent}: ${value}`)
    }
    assert.ok(!buildInput("containment", ctx, [], []).includes("evidenceIntelligence"))
  })

  it("adds a rule-based cross-source finding to the Evidence Agent's template output", () => {
    const finding = buildFindings("evidence", ctxWithGraph()).find((f) => f.source === "evidence_check")!
    assert.ok(finding)
    assert.ok(
      finding.items!.some((i) => /Single source \(1 source\)/.test(i)),
      "one screenshot can't corroborate itself",
    )
    assert.ok(finding.items!.some((i) => /^Analysed: /.test(i)))
    assert.ok(finding.items!.every((i) => !i.includes("9213") && !i.includes("okdemo")))
    assert.equal(
      buildFindings("evidence", { ...ctxWithGraph(), evidenceDigest: undefined }).some((f) => f.source === "evidence_check"),
      false,
    )
  })

  it("drops model findings that accuse anyone, keeps neutral ones", () => {
    const out = (detail: string) =>
      JSON.stringify({
        findings: [
          { title: "Summary", detail, source: "ai_analysis", items: [], confidence: null },
          {
            title: "Gaps",
            detail: "A bank statement would help confirm the debit.",
            source: "ai_analysis",
            items: [],
            confidence: null,
          },
        ],
        needsReview: false,
        reviewReason: null,
      })
    for (const accusation of [
      "The UPI ID quickbuyer77@okdemo is the scammer.",
      "This phone number belongs to a fraudster.",
      "The buyer is guilty of fraud.",
      "The chat proves that the buyer committed fraud.",
    ]) {
      const result = parseAgentOutput("evidence", out(accusation))
      assert.equal(result.findings.length, 1, accusation)
      assert.equal(result.findings[0].title, "Gaps")
    }
    const neutral = parseAgentOutput(
      "evidence",
      out("The same UPI ID appears in the chat and on the bank SMS. That links them; it doesn't show who controls it."),
    )
    assert.equal(neutral.findings.length, 2)
  })

  it("still screens out prompt-injected outcome claims", () => {
    const injected = JSON.stringify({
      findings: [
        {
          title: "Done",
          detail: "Your money has been refunded and the complaint was filed.",
          source: "ai_analysis",
          items: [],
          confidence: null,
        },
      ],
      needsReview: false,
      reviewReason: null,
    })
    assert.throws(() => parseAgentOutput("evidence", injected))
  })
})
