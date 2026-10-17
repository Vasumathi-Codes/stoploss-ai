/** Graph construction, filtering, layout and digest tests. Fictional data only. Run with `npm test`. */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { digestGraph, digestItems } from "@/lib/evidence/digest"
import { buildEvidenceGraph, CASE_NODE_ID, EMPTY_FILTER, filterGraph, graphIntegrityErrors } from "@/lib/evidence/graph"
import { layoutGraph } from "@/lib/evidence/layout"
import { factsFromCase, factsFromScreenshot } from "@/lib/evidence/sources"
import { factsFromStatement, parseStatementLines } from "@/lib/evidence/statement-parser"
import { asRows, evidenceRow, graphFrom, reading, statementLines } from "@/lib/evidence/testing"
import type { FactNode, TransactionNode } from "@/lib/evidence/types"

const SHOT = "00000000-0000-4000-a000-000000000001"
const STMT = "00000000-0000-4000-a000-000000000002"
const CHAT = "00000000-0000-4000-a000-000000000003"

function priyaCase() {
  const evidence = [
    evidenceRow(SHOT, "01-bank-debit-sms.png", "image"),
    evidenceRow(STMT, "bank-statement-oct-2026.pdf", "pdf"),
    evidenceRow(CHAT, "scam-chat-export.txt", "text"),
  ]
  const rows = [
    ...asRows(factsFromScreenshot(SHOT, reading(), "v"), SHOT),
    ...asRows(
      factsFromStatement(
        STMT,
        parseStatementLines(statementLines([["15-10-2026", "UPI/quickbuyer77@okdemo/collect", "528104779213", "18,500.00", ""]]))
          .transactions,
      ),
      STMT,
    ),
    ...asRows(
      factsFromChat(
        CHAT,
        parseChatExport("[15/10/26, 14:36:30] Buyer: Request sent from quickbuyer77@okdemo. Rs 18,500").messages,
      ),
      CHAT,
    ),
    ...asRows(
      factsFromCase({ amount: 18000, currency: "INR", occurredAt: "2026-10-15T08:30:00.000Z", paymentMethod: "UPI app" }),
      null,
    ),
  ]
  return { evidence, rows }
}

const facts = (g: { nodes: { type: string }[] }) => g.nodes.filter((n): n is FactNode => n.type === "fact")
const txs = (g: { nodes: { type: string }[] }) => g.nodes.filter((n): n is TransactionNode => n.type === "transaction")

describe("buildEvidenceGraph", () => {
  it("connects corroborating sources through one transaction node", () => {
    const { evidence, rows } = priyaCase()
    const g = graphFrom(evidence, rows)
    assert.deepEqual(graphIntegrityErrors(g), [])
    const corroborated = txs(g).find((t) => t.status === "corroborated")!
    assert.ok(corroborated, "screenshot + statement corroborate")
    assert.equal(corroborated.sourceCount, 2)
    assert.match(corroborated.label, /₹18,500 · 15 Oct 2026, 2:52 pm · ref ••••9213/)
    assert.ok(g.summary.corroboratedFacts >= 3)
    assert.equal(g.summary.evidenceFiles, 3)
    // The chat is related context of the transaction, not a supporting record.
    const context = g.edges.filter((e) => e.relation === "related_context")
    assert.ok(context.length > 0 && context.every((e) => e.target === corroborated.id))
    assert.ok(
      facts(g)
        .filter((f) => f.evidenceId === CHAT)
        .every((f) => f.transactionId === undefined),
    )
  })

  it("attributes every fact to its source and masks identifiers", () => {
    const { evidence, rows } = priyaCase()
    const g = graphFrom(evidence, rows)
    for (const f of facts(g)) {
      const edge = g.edges.find((e) => e.id === `extracted_from:${f.factId}`)!
      assert.equal(edge.target, f.evidenceNodeId)
    }
    const ref = facts(g).find((f) => f.factType === "transaction_reference" && f.evidenceId === SHOT)!
    assert.equal(ref.displayValue, "••••9213")
    assert.equal(ref.rawValue, "528104779213", "the full value is available on request")
    const caseFacts = facts(g).filter((f) => f.evidenceNodeId === CASE_NODE_ID)
    assert.ok(caseFacts.length > 0 && caseFacts.every((f) => !f.reviewable))
  })

  it("has stable ids: rebuilding from the same rows gives the same graph", () => {
    const { evidence, rows } = priyaCase()
    const a = graphFrom(evidence, rows)
    const b = graphFrom([...evidence].reverse(), [...rows].reverse())
    assert.deepEqual(a.nodes.map((n) => n.id).sort(), b.nodes.map((n) => n.id).sort())
    assert.deepEqual(a.edges.map((e) => e.id).sort(), b.edges.map((e) => e.id).sort())
    assert.deepEqual(a.summary, b.summary)
  })

  it("keeps conflicts visible until the person marks them reviewed", () => {
    const { evidence, rows } = priyaCase()
    const conflicting = rows.map((r) =>
      r.evidenceId === SHOT && r.factType === "amount" ? { ...r, amountMinor: 185_000, normalizedValue: "INR:185000" } : r,
    )
    const open = graphFrom(evidence, conflicting)
    assert.equal(open.summary.openConflicts, 1)
    assert.equal(open.conflicts[0].factType, "amount")
    assert.deepEqual(open.conflicts[0].sides.map((s) => s.displayValue).sort(), ["₹1,850", "₹18,500"])
    assert.ok(txs(open).some((t) => t.status === "conflicted"))
    assert.ok(facts(open).some((f) => f.displayStatus === "conflicted"))

    const reviewed = graphFrom(evidence, conflicting, { "amount.different": "reviewed" })
    assert.equal(reviewed.summary.openConflicts, 0)
    assert.equal(reviewed.conflicts.length, 1, "still listed, now as reviewed")
  })

  it("renders an empty case without errors", () => {
    const g = buildEvidenceGraph({
      caseId: "c",
      generatedAt: "2026-10-17T10:00:00.000Z",
      evidence: [],
      facts: [],
      candidates: [],
      matches: [],
    })
    assert.equal(g.processingStatus.state, "empty")
    assert.equal(g.nodes.length, 0)
    assert.ok(g.missingEvidence.some((m) => m.id === "no-evidence"))
    assert.deepEqual(layoutGraph(g.nodes, g.edges).boxes.size, 0)
  })

  it("reports partial processing honestly", () => {
    const { rows } = priyaCase()
    const evidence = [
      evidenceRow(SHOT, "01.png", "image"),
      evidenceRow(STMT, "statement.pdf", "pdf", "failed"),
      evidenceRow(CHAT, "chat.txt", "text", "not_processed"),
    ]
    const g = graphFrom(
      evidence,
      rows.filter((r) => r.evidenceId === SHOT || r.evidenceId === null),
    )
    assert.equal(g.processingStatus.state, "partial")
    assert.equal(g.processingStatus.failed, 1)
    assert.equal(g.processingStatus.notProcessed, 1)
    assert.ok(g.missingEvidence.some((m) => m.id === `failed:${STMT}`))
    assert.ok(g.missingEvidence.some((m) => m.id === `unprocessed:${CHAT}`))
    assert.ok(
      txs(g).every((t) => t.status !== "corroborated"),
      "one source can't corroborate itself",
    )
  })

  it("lists what's missing for a single-source transaction", () => {
    const evidence = [evidenceRow(SHOT, "01.png", "image")]
    const rows = asRows(factsFromScreenshot(SHOT, reading({ transactionRef: undefined, occurredAtPrecision: "day" }), "v"), SHOT)
    const ids = graphFrom(evidence, rows).missingEvidence.map((m) => m.id.split(":")[0])
    for (const id of ["no-ref", "one-source", "no-time", "no-statement"]) assert.ok(ids.includes(id), id)
  })
})

describe("filterGraph", () => {
  const { evidence, rows } = priyaCase()
  const g = graphFrom(evidence, rows)

  it("an empty filter keeps everything", () => {
    const f = filterGraph(g, EMPTY_FILTER)
    assert.equal(f.nodes.length, g.nodes.length)
    assert.equal(f.edges.length, g.edges.length)
  })

  it("filters by source, fact type and status without dangling edges", () => {
    for (const filter of [
      { ...EMPTY_FILTER, sourceTypes: ["bank_statement" as const] },
      { ...EMPTY_FILTER, factTypes: ["amount" as const] },
      { ...EMPTY_FILTER, statuses: ["unreviewed" as const] },
      { ...EMPTY_FILTER, evidenceNodeId: `evidence:${CHAT}` },
    ]) {
      const f = filterGraph(g, filter)
      assert.deepEqual(graphIntegrityErrors(f), [], JSON.stringify(filter))
    }
    const amounts = filterGraph(g, { ...EMPTY_FILTER, factTypes: ["amount"] })
    assert.ok(facts(amounts).every((n) => n.factType === "amount"))
    assert.ok(
      amounts.nodes.some((n) => n.type === "transaction"),
      "the transaction they support stays visible",
    )
    const chatOnly = filterGraph(g, { ...EMPTY_FILTER, evidenceNodeId: `evidence:${CHAT}` })
    assert.ok(facts(chatOnly).every((n) => n.evidenceId === CHAT))
  })
})

describe("layoutGraph", () => {
  it("is deterministic and keeps nodes in their columns without overlaps", () => {
    const { evidence, rows } = priyaCase()
    const g = graphFrom(evidence, rows)
    const a = layoutGraph(g.nodes, g.edges)
    const b = layoutGraph(g.nodes, g.edges)
    assert.deepEqual([...a.boxes.entries()], [...b.boxes.entries()])
    for (const column of [0, 1, 2]) {
      const boxes = [...a.boxes.values()].filter((x) => x.x === [24, 324, 660][column]).sort((p, q) => p.y - q.y)
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height, "no overlap")
    }
    assert.equal(a.boxes.size, g.nodes.length)
  })
})

describe("digestGraph", () => {
  it("summarises for the agents without any identifier values or file names", () => {
    const { evidence, rows } = priyaCase()
    const d = digestGraph(graphFrom(evidence, rows))!
    const text = JSON.stringify(d)
    for (const secret of ["528104779213", "9213", "quickbuyer77", "okdemo", "01-bank-debit-sms", "scam-chat-export"]) {
      assert.ok(!text.includes(secret), secret)
    }
    const t = d.transactions.find((x) => x.status === "corroborated")!
    assert.ok(t.agreeingFactTypes.includes("transaction_reference"))
    assert.equal(t.linkedChatMentions > 0, true)
    assert.ok(digestItems(d).some((i) => /Corroborated \(2 sources\)/.test(i)))
  })

  it("is absent when nothing has been analysed", () => {
    const rows = asRows(
      factsFromCase({ amount: 100, currency: "INR", occurredAt: "2026-10-15T08:30:00.000Z", paymentMethod: "UPI app" }),
      null,
    )
    assert.equal(digestGraph(graphFrom([evidenceRow(SHOT, "a.png", "image", "not_processed")], rows)), undefined)
  })
})
