/**
 * Evaluation on labelled, fictional fixtures. Prints metrics and fails if they fall below the
 * stated thresholds. Passing says the rules behave as designed on THESE fixtures — it is not
 * evidence of accuracy on real-world screenshots, statements or chats.
 * Run with `npm test` (or alone: node --conditions=react-server --import tsx --test src/lib/evidence/evaluation.test.ts).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { runMatching } from "@/lib/evidence/matching"
import { factsFromScreenshot } from "@/lib/evidence/sources"
import { factsFromStatement, parseStatementLines } from "@/lib/evidence/statement-parser"
import { asRows, engineFacts, reading, statementLines } from "@/lib/evidence/testing"
import type { GraphFactInput } from "@/lib/evidence/graph"
import { parseAgentOutput } from "@/server/foundry/agents"

type Row = Parameters<typeof statementLines>[0][number]

/** Each scenario: records, and the ground-truth transaction each record belongs to. */
interface Scenario {
  name: string
  records: { id: string; rows: GraphFactInput[]; truth: string }[]
  /** Conflicts that a correct engine must report (rule ids). */
  expectConflicts?: string[]
}

const shot = (id: string, truth: string, o: Parameters<typeof reading>[0] = {}) => ({
  id,
  truth,
  rows: asRows(factsFromScreenshot(id, reading(o), "v"), id),
})
const line = (id: string, truth: string, row: Row) => ({
  id,
  truth,
  rows: asRows(factsFromStatement(id, parseStatementLines(statementLines([row])).transactions), id),
})

const SCENARIOS: Scenario[] = [
  {
    name: "screenshot + statement, same UTR",
    records: [shot("a1", "T1"), line("a2", "T1", ["15-10-2026", "UPI/quickbuyer77@okdemo", "528104779213", "18,500.00", ""])],
  },
  {
    name: "two payments, same amount, different days",
    records: [
      shot("b1", "T1", { transactionRef: undefined, counterparty: undefined }),
      shot("b2", "T2", { transactionRef: undefined, counterparty: undefined, occurredAt: "2026-10-11T09:22:00.000Z" }),
    ],
  },
  {
    name: "two payments, same amount and day, different UTRs and recipients",
    records: [
      shot("c1", "T1", { counterparty: "a.one@okdemo" }),
      shot("c2", "T2", { transactionRef: "528104779299", counterparty: "b.two@okdemo" }),
    ],
  },
  {
    name: "screenshot without UTR + matching statement line",
    records: [
      shot("d1", "T1", { transactionRef: undefined }),
      line("d2", "T1", ["15-10-2026", "UPI/quickbuyer77@okdemo", "528104779213", "18,500.00", ""]),
    ],
  },
  {
    name: "IMPS and UPI payments in one case",
    records: [
      shot("e1", "T1"),
      shot("e2", "T2", {
        amount: 50000,
        transactionRef: "629118447210",
        counterparty: "Global Trade Invest Pvt",
        occurredAt: "2026-10-14T13:50:00.000Z",
      }),
      line("e3", "T1", ["15-10-2026", "UPI/quickbuyer77@okdemo", "528104779213", "18,500.00", ""]),
      line("e4", "T2", ["14-10-2026", "IMPS/Global Trade Invest Pvt/XXXX9921", "629118447210", "50,000.00", ""]),
    ],
  },
  {
    name: "same UTR, misread amount",
    records: [
      shot("f1", "T1", { amount: 1850 }),
      line("f2", "T1", ["15-10-2026", "UPI/quickbuyer77@okdemo", "528104779213", "18,500.00", ""]),
    ],
    expectConflicts: ["amount.different"],
  },
  {
    name: "debit and its reversal",
    records: [shot("g1", "T1"), line("g2", "T1", ["16-10-2026", "UPI REV/quickbuyer77@okdemo", "528104779213", "", "18,500.00"])],
    expectConflicts: ["direction.mismatch"],
  },
  {
    name: "same UTR, different recipient shown",
    records: [shot("h1", "T1"), shot("h2", "T1", { kind: "payment_app", counterparty: "merchant.agg@okdemo" })],
    expectConflicts: ["recipient.different"],
  },
  {
    name: "ambiguous: one screenshot, two equal statement lines",
    records: [
      shot("i1", "T0", { transactionRef: undefined, counterparty: undefined }),
      line("i2", "T1", ["15-10-2026", "UPI/a.one@okdemo", "528104770001", "18,500.00", ""]),
      line("i3", "T2", ["15-10-2026", "UPI/b.two@okdemo", "528104770002", "18,500.00", ""]),
    ],
  },
]

/** Pairwise clustering metrics: a pair is positive if both records are in one candidate. */
function evaluate() {
  let tp = 0
  let fp = 0
  let fn = 0
  let conflictsExpected = 0
  let conflictsFound = 0
  for (const s of SCENARIOS) {
    const out = runMatching(engineFacts(s.records.flatMap((r) => r.rows)))
    const candidateOf = (r: Scenario["records"][number]) => out.factCandidate.get(r.rows[0].id)
    for (let i = 0; i < s.records.length; i++)
      for (let j = i + 1; j < s.records.length; j++) {
        const same = s.records[i].truth === s.records[j].truth
        const grouped = candidateOf(s.records[i]) === candidateOf(s.records[j])
        if (same && grouped) tp++
        else if (!same && grouped) fp++
        else if (same && !grouped) fn++
      }
    for (const rule of s.expectConflicts ?? []) {
      conflictsExpected++
      if (out.results.some((r) => r.ruleId === rule && r.outcome === "conflict")) conflictsFound++
    }
  }
  return {
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    conflictRecall: conflictsFound / conflictsExpected,
    tp,
    fp,
    fn,
  }
}

describe("evaluation on labelled fixtures", () => {
  it("groups records into transactions with full precision on the fixtures", () => {
    const m = evaluate()
    console.info(
      `[eval] match precision=${m.precision.toFixed(2)} recall=${m.recall.toFixed(2)} (tp=${m.tp} fp=${m.fp} fn=${m.fn}) conflict detection=${m.conflictRecall.toFixed(2)}`,
    )
    // A false merge hides a payment, so precision must be perfect; recall may trade off for it.
    assert.equal(m.precision, 1)
    assert.ok(m.recall >= 0.9)
    assert.equal(m.conflictRecall, 1)
  })

  it("rejects every sensitive value across the adapters", () => {
    const traps = [
      // 05-otp-sms.png / 06-card-debit-full-card-number.png style values reaching the adapters.
      { name: "card as reference", facts: factsFromScreenshot("x", reading({ transactionRef: "4111111111111111" }), "v") },
      { name: "card as recipient", facts: factsFromScreenshot("x", reading({ counterparty: "4111 1111 1111 1111" }), "v") },
      { name: "otp in recipient", facts: factsFromScreenshot("x", reading({ counterparty: "OTP is 482913" }), "v") },
      { name: "otp in chat", facts: factsFromChat("c", parseChatExport("[15/10/26, 14:40:00] X: your OTP is 482913").messages) },
      {
        name: "pin in chat",
        facts: factsFromChat("c", parseChatExport("[15/10/26, 14:40:00] X: UPI PIN: 4821 send now").messages),
      },
      {
        name: "cvv in chat",
        facts: factsFromChat("c", parseChatExport("[15/10/26, 14:40:00] X: cvv 123 and card 4111111111111111").messages),
      },
    ]
    const leaked = traps.filter((t) =>
      t.facts.some((f) => /482913|4111|\b4821\b|\b123\b/.test(`${f.rawValue} ${f.normalizedValue}`)),
    )
    console.info(
      `[eval] sensitive-value rejection=${((traps.length - leaked.length) / traps.length).toFixed(2)} (${traps.length} traps)`,
    )
    assert.deepEqual(
      leaked.map((t) => t.name),
      [],
    )
  })

  it("screens unsupported claims out of model output", () => {
    const claims = [
      { text: "The UPI ID is the scammer's.", unsupported: true },
      { text: "This number belongs to the fraudster.", unsupported: true },
      { text: "The recipient is a criminal.", unsupported: true },
      { text: "Your money will be refunded.", unsupported: true },
      { text: "The transaction was reversed.", unsupported: true },
      { text: "The same UPI ID appears in the chat and the bank SMS.", unsupported: false },
      { text: "Ask your bank whether the payment was reversed.", unsupported: false },
    ]
    let caught = 0
    let wrong = 0
    for (const c of claims) {
      const output = JSON.stringify({
        findings: [
          { title: "Claim", detail: c.text, source: "ai_analysis", items: [], confidence: null },
          { title: "Keep", detail: "A bank statement would help.", source: "ai_analysis", items: [], confidence: null },
        ],
        needsReview: false,
        reviewReason: null,
      })
      const dropped = parseAgentOutput("evidence", output).findings.length === 1
      if (c.unsupported && dropped) caught++
      if (!c.unsupported && dropped) wrong++
    }
    const total = claims.filter((c) => c.unsupported).length
    console.info(
      `[eval] unsupported-claim screening=${(caught / total).toFixed(2)} false-drops=${wrong}/${claims.length - total}`,
    )
    assert.equal(caught, total)
    assert.equal(wrong, 0)
  })

  it("matches about 200 facts quickly", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      asRows(
        factsFromScreenshot(`p${i}`, reading({ transactionRef: `5281047${String(70000 + i)}`, amount: 1000 + i }), "v"),
        `p${i}`,
      ),
    ).flat()
    const start = performance.now()
    const out = runMatching(engineFacts(rows))
    const ms = performance.now() - start
    console.info(`[eval] matching latency=${ms.toFixed(1)}ms for ${rows.length} facts`)
    assert.equal(out.candidates.length, 30)
    assert.ok(ms < 500)
  })
})
