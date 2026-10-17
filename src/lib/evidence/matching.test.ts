/** Deterministic matching tests. All data is fictional. Run with `npm test`. */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { toEngineFact } from "@/lib/evidence/graph"
import { type EngineOutput, runMatching } from "@/lib/evidence/matching"
import { factsFromCase, factsFromScreenshot } from "@/lib/evidence/sources"
import { factsFromStatement, parseStatementLines } from "@/lib/evidence/statement-parser"
import { asRows, engineFacts, reading, statementLines } from "@/lib/evidence/testing"
import type { GraphFactInput } from "@/lib/evidence/graph"

const shot = (id: string, overrides: Parameters<typeof reading>[0] = {}) =>
  asRows(factsFromScreenshot(id, reading(overrides), "v"), id)
const statement = (id: string, rows: Parameters<typeof statementLines>[0]) =>
  asRows(factsFromStatement(id, parseStatementLines(statementLines(rows)).transactions), id)
const UPI_ROW: Parameters<typeof statementLines>[0][number] = [
  "15-10-2026",
  "UPI/quickbuyer77@okdemo/collect",
  "528104779213",
  "18,500.00",
  "",
]

const rules = (out: EngineOutput) => out.results.map((r) => r.ruleId).sort()
const has = (out: EngineOutput, ruleId: string, outcome?: string) =>
  out.results.some((r) => r.ruleId === ruleId && (outcome === undefined || r.outcome === outcome))

describe("transaction identity", () => {
  it("same UTR and same amount → one corroborated transaction", () => {
    const out = runMatching(engineFacts([...shot("s1"), ...statement("st", [UPI_ROW])]))
    assert.equal(out.candidates.length, 1)
    const [c] = out.candidates
    assert.equal(c.key, "ref:528104779213")
    assert.equal(c.independentSources, 2)
    assert.ok(c.corroboratedTypes.includes("transaction_reference"))
    assert.ok(c.corroboratedTypes.includes("amount"))
    assert.ok(has(out, "ref.exact", "match"))
    assert.ok(has(out, "amount.exact", "match"))
    assert.ok(has(out, "date.same_day", "match"), "statement shows only a date")
    assert.ok(!out.results.some((r) => r.outcome === "conflict"))
  })

  it("same UTR but a conflicting amount → still one transaction, with the conflict kept", () => {
    const out = runMatching(engineFacts([...shot("s1", { amount: 1850 }), ...statement("st", [UPI_ROW])]))
    assert.equal(out.candidates.length, 1)
    const conflict = out.results.find((r) => r.ruleId === "amount.different")!
    assert.equal(conflict.outcome, "conflict")
    assert.equal(conflict.relation, "conflicts_with")
    assert.equal(conflict.requiresReview, true)
    assert.match(conflict.explanation, /₹1,850 vs ₹18,500/)
  })

  it("same amount on different days and no references → unrelated", () => {
    const out = runMatching(
      engineFacts([
        ...shot("s1", { transactionRef: undefined, counterparty: undefined }),
        ...shot("s2", { transactionRef: undefined, counterparty: undefined, occurredAt: "2026-10-12T09:22:00.000Z" }),
      ]),
    )
    assert.equal(out.candidates.length, 2)
    assert.equal(out.results.length, 0)
  })

  it("different UTRs with the same amount and date → two transactions, never merged", () => {
    const out = runMatching(
      engineFacts([
        ...shot("s1", { counterparty: "a.one@okdemo" }),
        ...shot("s2", { transactionRef: "528104779299", counterparty: "b.two@okdemo" }),
      ]),
    )
    assert.equal(out.candidates.length, 2)
  })

  it("different UTRs but identical amount, date and recipient → grouped, reference conflict shown", () => {
    const out = runMatching(
      engineFacts([...shot("s1"), ...shot("s2", { transactionRef: "528104779299", occurredAt: "2026-10-15T09:25:00.000Z" })]),
    )
    assert.equal(out.candidates.length, 1)
    assert.ok(has(out, "link.amount_date"))
    assert.ok(has(out, "ref.different", "conflict"))
  })

  it("a screenshot without a reference joins the only compatible statement line", () => {
    const out = runMatching(engineFacts([...shot("s1", { transactionRef: undefined }), ...statement("st", [UPI_ROW])]))
    assert.equal(out.candidates.length, 1)
    const link = out.results.find((r) => r.ruleId === "link.amount_date")!
    assert.equal(link.relation, "possibly_same_transaction")
    assert.equal(link.requiresReview, true)
  })

  it("an ambiguous record is not grouped with any candidate", () => {
    const out = runMatching(
      engineFacts([
        ...shot("s1", { transactionRef: undefined, counterparty: undefined }),
        ...statement("st", [UPI_ROW, ["15-10-2026", "UPI/other.shop@okdemo", "528104770001", "18,500.00", ""]]),
      ]),
    )
    assert.equal(out.candidates.length, 3)
    assert.equal(out.results.filter((r) => r.ruleId === "link.ambiguous").length, 2)
    assert.ok(out.results.filter((r) => r.ruleId === "link.ambiguous").every((r) => r.candidateKey === undefined))
  })

  it("two lines of one statement are never joined by amount and date", () => {
    const out = runMatching(
      engineFacts(
        statement("st", [
          ["15-10-2026", "UPI/a.one@okdemo", "", "500.00", ""],
          ["15-10-2026", "UPI/a.one@okdemo", "", "500.00", ""],
        ]),
      ),
    )
    assert.equal(out.candidates.length, 2)
  })

  it("keeps several disputed payments in one case apart", () => {
    const out = runMatching(
      engineFacts([
        ...shot("s1"),
        ...shot("s8", {
          amount: 50000,
          transactionRef: "629118447210",
          counterparty: "Global Trade Invest Pvt",
          occurredAt: "2026-10-14T13:50:00.000Z",
        }),
        ...statement("st", [UPI_ROW, ["14-10-2026", "IMPS/Global Trade Invest Pvt/XXXX9921", "629118447210", "50,000.00", ""]]),
      ]),
    )
    assert.deepEqual(
      out.candidates.map((c) => [c.key, c.independentSources]),
      [
        ["ref:528104779213", 2],
        ["ref:629118447210", 2],
      ],
    )
    assert.ok(has(out, "name.exact", "match"), "IMPS name matches the screenshot's recipient name")
  })
})

describe("conflicts and uncertainty", () => {
  it("debit vs credit with the same reference is a conflict that mentions a reversal", () => {
    const out = runMatching(
      engineFacts([
        ...shot("s1"),
        ...statement("st", [["16-10-2026", "UPI REV/quickbuyer77@okdemo", "528104779213", "", "18,500.00"]]),
      ]),
    )
    const c = out.results.find((r) => r.ruleId === "direction.mismatch")!
    assert.equal(c.outcome, "conflict")
    assert.match(c.uncertainty!, /reversal or refund/)
    assert.ok(has(out, "date.adjacent_day", "partial_match"))
  })

  it("contradictory recipient identifiers conflict, and block grouping without a shared reference", () => {
    const sameRef = runMatching(engineFacts([...shot("s1"), ...shot("s2", { counterparty: "someone.else@okdemo" })]))
    assert.ok(has(sameRef, "recipient.different", "conflict"))
    const noRef = runMatching(
      engineFacts([
        ...shot("s1", { transactionRef: undefined }),
        ...shot("s2", { transactionRef: undefined, counterparty: "someone.else@okdemo" }),
      ]),
    )
    assert.equal(noRef.candidates.length, 2)
  })

  it("times 30 minutes apart on the same day are a partial match needing review", () => {
    const out = runMatching(
      engineFacts([...shot("s1"), ...shot("s2", { kind: "payment_app", occurredAt: "2026-10-15T09:52:00.000Z" })]),
    )
    const t = out.results.find((r) => r.ruleId === "time.same_day")!
    assert.equal(t.outcome, "partial_match")
    assert.equal(t.requiresReview, true)
  })

  it("times within 10 minutes match", () => {
    const out = runMatching(
      engineFacts([...shot("s1"), ...shot("s2", { kind: "payment_app", occurredAt: "2026-10-15T09:28:00.000Z" })]),
    )
    assert.ok(has(out, "time.within_tolerance", "match"))
  })

  it("the case's approximate amount is linked by recipient and flagged, not overruled", () => {
    const kase = asRows(
      factsFromCase({
        amount: 18000,
        currency: "INR",
        occurredAt: "2026-10-15T08:30:00.000Z",
        paymentMethod: "UPI app",
        counterparty: "quickbuyer77@okdemo",
      }),
      null,
    )
    const out = runMatching(engineFacts([...kase, ...shot("s1", { transactionRef: undefined })]))
    assert.equal(out.candidates.length, 1)
    assert.ok(has(out, "link.recipient"))
    assert.ok(has(out, "amount.reported_differs", "conflict"))
    assert.ok(has(out, "time.reported_approximate", "partial_match"))
    assert.equal(out.candidates[0].independentSources, 1, "the case form is not an independent source")
  })

  it("the case's approximate amount alone never links to evidence", () => {
    const kase = asRows(
      factsFromCase({ amount: 18000, currency: "INR", occurredAt: "2026-10-15T08:30:00.000Z", paymentMethod: "UPI app" }),
      null,
    )
    const out = runMatching(engineFacts([...kase, ...shot("s1", { transactionRef: undefined, counterparty: undefined })]))
    assert.equal(out.candidates.length, 2)
  })
})

describe("sources and review", () => {
  it("duplicate screenshots count as one source and don't corroborate", () => {
    const out = runMatching(engineFacts([...shot("s1"), ...shot("s1copy")]))
    assert.equal(out.candidates.length, 1)
    assert.ok(has(out, "source.possible_duplicate"))
    assert.equal(out.candidates[0].independentSources, 1)
    assert.deepEqual(out.candidates[0].corroboratedTypes, [])
  })

  it("rejected facts are left out; corrections replace the extracted value", () => {
    const rows = [...shot("s1"), ...statement("st", [UPI_ROW])]
    const ref = rows.find((r) => r.evidenceId === "s1" && r.factType === "transaction_reference")!
    const rejected = runMatching(
      engineFacts(rows.map((r) => (r.id === ref.id ? { ...r, reviewStatus: "user_rejected" as const } : r))),
    )
    assert.ok(!rejected.results.some((r) => r.factAId === ref.id || r.factBId === ref.id))

    const amount = rows.find((r) => r.evidenceId === "s1" && r.factType === "amount")!
    const corrected: GraphFactInput[] = rows.map((r) =>
      r.id === amount.id
        ? {
            ...r,
            rawValue: "INR 1850",
            amountMinor: 185_000,
            normalizedValue: "INR:185000",
            reviewStatus: "user_corrected",
            correctedValue: "18,500",
          }
        : r,
    )
    assert.equal(toEngineFact(corrected.find((r) => r.id === amount.id)!).amountMinor, 1_850_000)
    assert.ok(has(runMatching(engineFacts(corrected)), "amount.exact", "match"))
  })

  it("links the chat by identifier and nearby amount, and never by amount on another day", () => {
    const chat = (text: string) => asRows(factsFromChat("chat", parseChatExport(text).messages), "chat")
    const out = runMatching(
      engineFacts([...shot("s1"), ...chat("[15/10/26, 14:36:30] B: Request sent from quickbuyer77@okdemo for Rs 18,500")]),
    )
    assert.ok(has(out, "context.same_identifier", "match"))
    assert.ok(has(out, "context.amount_near_date", "partial_match"))
    assert.ok(out.results.filter((r) => r.relation === "related_context").every((r) => /does not show/.test(r.explanation)))

    const far = runMatching(engineFacts([...shot("s1"), ...chat("[01/09/26, 10:00:00] B: send Rs 18,500")]))
    assert.ok(!far.results.some((r) => r.relation === "related_context"))
  })

  it("is deterministic: input order doesn't change candidates, keys or explanations", () => {
    const rows = [...shot("s1"), ...statement("st", [UPI_ROW]), ...shot("s8", { amount: 50000, transactionRef: "629118447210" })]
    const a = runMatching(engineFacts(rows))
    const b = runMatching(engineFacts([...rows].reverse()))
    assert.deepEqual(a.candidates, b.candidates)
    assert.deepEqual(a.results.map((r) => r.key).sort(), b.results.map((r) => r.key).sort())
    assert.deepEqual(rules(a), rules(b))
  })
})
