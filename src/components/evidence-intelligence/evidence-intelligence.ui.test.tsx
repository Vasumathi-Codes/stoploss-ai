/**
 * Render checks for the Evidence Intelligence components, server-rendered with react-dom
 * (no browser). They confirm the markup, labels and accessibility attributes for the populated,
 * empty, filtered and conflict states. Interaction (clicks, zoom) is covered by the pure
 * functions they call (filterGraph, layoutGraph) and by manual testing.
 * Run with `npm run test:ui`.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { EvidenceDetailPanel, conflictSelection } from "@/components/evidence-intelligence/evidence-detail-panel"
import { EvidenceGraphCanvas, GraphErrorBoundary } from "@/components/evidence-intelligence/evidence-graph-canvas"
import { EvidenceGraphList } from "@/components/evidence-intelligence/evidence-graph-list"
import { factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { EMPTY_FILTER, filterGraph } from "@/lib/evidence/graph"
import { factsFromScreenshot } from "@/lib/evidence/sources"
import { asRows, evidenceRow, graphFrom, reading } from "@/lib/evidence/testing"
import type { FactNode } from "@/lib/evidence/types"

const SHOT = "00000000-0000-4000-a000-000000000001"
const SHOT2 = "00000000-0000-4000-a000-000000000002"
const CHAT = "00000000-0000-4000-a000-000000000003"

function sample() {
  return graphFrom(
    [
      evidenceRow(SHOT, "01-bank-debit-sms.png", "image"),
      evidenceRow(SHOT2, "02-app.png", "image"),
      evidenceRow(CHAT, "chat.txt", "text"),
    ],
    [
      ...asRows(factsFromScreenshot(SHOT, reading(), "v"), SHOT),
      ...asRows(factsFromScreenshot(SHOT2, reading({ kind: "payment_app", amount: 1850 }), "v"), SHOT2),
      ...asRows(
        factsFromChat(CHAT, parseChatExport("[15/10/26, 14:36:30] B: Request sent from quickbuyer77@okdemo").messages),
        CHAT,
      ),
    ],
  )
}

const noop = () => {}

describe("graph canvas", () => {
  it("renders every node as a labelled, pressable button and a legend", () => {
    const g = sample()
    const html = renderToStaticMarkup(<EvidenceGraphCanvas nodes={g.nodes} edges={g.edges} onSelect={noop} />)
    const buttons = html.match(/<button[^>]*aria-pressed/g) ?? []
    assert.equal(buttons.length, g.nodes.length)
    assert.match(html, /aria-label="Amount: ₹18,500\. In conflict\."/)
    assert.match(html, /aria-label="Zoom in"/)
    assert.match(html, /Conflicts with/)
    assert.ok(!html.includes("528104779213"), "references are masked in the graph")
  })

  it("marks the selected node", () => {
    const g = sample()
    const fact = g.nodes.find((n) => n.type === "fact")!
    const html = renderToStaticMarkup(
      <EvidenceGraphCanvas nodes={g.nodes} edges={g.edges} selectedId={fact.id} onSelect={noop} />,
    )
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
  })

  it("falls back to the given content when drawing fails", () => {
    function Broken(): never {
      throw new Error("boom")
    }
    // Server rendering doesn't run error boundaries, so check the boundary's own contract.
    assert.deepEqual(GraphErrorBoundary.getDerivedStateFromError(), { failed: true })
    assert.throws(() => renderToStaticMarkup(<Broken />))
  })
})

describe("list view", () => {
  it("shows the same facts grouped by transaction, with context separate", () => {
    const g = sample()
    const html = renderToStaticMarkup(<EvidenceGraphList nodes={g.nodes} edges={g.edges} onSelect={noop} />)
    assert.match(html, /Mentioned in conversations \(context\)/)
    assert.match(html, /Conflict to review/)
    const facts = g.nodes.filter((n) => n.type === "fact").length
    const factButtons = (html.match(/from (01-bank|02-app|chat\.txt)/g) ?? []).length
    assert.equal(factButtons, facts)
  })

  it("renders a filtered view without the filtered-out facts", () => {
    const g = sample()
    const only = filterGraph(g, { ...EMPTY_FILTER, factTypes: ["amount"] })
    const html = renderToStaticMarkup(<EvidenceGraphList nodes={only.nodes} edges={only.edges} onSelect={noop} />)
    assert.ok(!html.includes("Transaction reference"))
    assert.match(html, /₹1,850/)
  })
})

describe("detail panel", () => {
  const props = { incidentId: "i1", onSelect: noop, onGraph: noop, onShowEvidence: noop }

  it("prompts for a selection when nothing is selected", () => {
    const html = renderToStaticMarkup(<EvidenceDetailPanel graph={sample()} {...props} />)
    assert.match(html, /Select a file, fact, transaction or conflict/)
  })

  it("shows a fact's source, method, status and review actions, masked by default", () => {
    const g = sample()
    const ref = g.nodes.find((n): n is FactNode => n.type === "fact" && n.factType === "transaction_reference")!
    const html = renderToStaticMarkup(<EvidenceDetailPanel graph={g} selectedId={ref.id} {...props} />)
    assert.match(html, /••••9213/)
    assert.ok(!html.includes("528104779213"), "full value hidden until asked")
    assert.match(html, /Show full value/)
    assert.match(html, /Screenshot Reader \(Microsoft Foundry vision model\)/)
    for (const action of ["Confirm", "Correct", "Needs checking", "Reject"]) assert.match(html, new RegExp(`>${action}<`))
  })

  it("compares conflicting values side by side and never picks one", () => {
    const g = sample()
    const conflict = g.conflicts.find((c) => c.factType === "amount")!
    const html = renderToStaticMarkup(
      <EvidenceDetailPanel graph={g} selectedId={conflictSelection(conflict.matchId)} {...props} />,
    )
    assert.match(html, /Value 1/)
    assert.match(html, /Value 2/)
    assert.match(html, /₹18,500/)
    assert.match(html, /₹1,850/)
    assert.match(html, /never decides which value is right/)
    assert.match(html, /Mark as reviewed/)
  })

  it("explains case-form facts can't be reviewed here", () => {
    const g = graphFrom(
      [],
      asRows(
        [...factsFromScreenshot(SHOT, reading(), "v")].map((f) => ({ ...f, sourceType: "case_details" as const })),
        null,
      ),
    )
    const fact = g.nodes.find((n) => n.type === "fact")!
    const html = renderToStaticMarkup(<EvidenceDetailPanel graph={g} selectedId={fact.id} {...props} />)
    assert.match(html, /comes from the case form/)
    assert.ok(!html.includes(">Confirm<"))
  })
})
