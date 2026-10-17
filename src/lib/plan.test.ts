import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildFindings, type AnalysisContext } from "@/lib/playbooks"
import { agentProvenance, nextStep, openPriority, orderPlan } from "@/lib/plan"
import { composeFindings } from "@/server/pipeline"
import type { ActionItem, AgentFinding, AgentId } from "@/types"

let n = 0
function step(key: string, priority: ActionItem["priority"], extra: Partial<ActionItem> = {}): ActionItem {
  n++
  return {
    id: key,
    incidentId: "inc",
    key,
    title: key,
    explanation: "",
    priority,
    status: "pending",
    origin: "suggested",
    timing: "",
    instructions: [],
    requiredInfo: [],
    updatedAt: `2026-10-16T10:00:${String(n).padStart(2, "0")}.000Z`,
    ...extra,
  }
}

describe("orderPlan", () => {
  it("orders by priority, keeping the original order within a priority", () => {
    const plan = [step("n1", "normal"), step("u1", "urgent"), step("h1", "high"), step("u2", "urgent")]
    assert.deepEqual(
      orderPlan(plan).map((a) => a.key),
      ["u1", "u2", "h1", "n1"],
    )
  })

  it("puts prerequisites before the steps that depend on them", () => {
    const plan = [step("file", "urgent", { dependsOn: ["evidence"] }), step("evidence", "normal"), step("call", "high")]
    assert.deepEqual(
      orderPlan(plan).map((a) => a.key),
      ["evidence", "file", "call"],
    )
  })

  it("leads with steps in progress and ends with completed ones", () => {
    const plan = [
      step("done", "urgent", { status: "completed", completedAt: "2026-10-16T11:00:00.000Z" }),
      step("u", "urgent"),
      step("going", "normal", { status: "in_progress" }),
    ]
    assert.deepEqual(
      orderPlan(plan).map((a) => a.key),
      ["going", "u", "done"],
    )
  })

  it("survives dependency cycles and unknown keys", () => {
    const plan = [step("a", "high", { dependsOn: ["b", "missing"] }), step("b", "high", { dependsOn: ["a"] })]
    assert.equal(orderPlan(plan).length, 2)
  })
})

describe("nextStep", () => {
  it("skips steps whose prerequisites are still open", () => {
    const plan = [step("file", "urgent", { dependsOn: ["evidence"] }), step("evidence", "normal")]
    assert.equal(nextStep(plan)?.key, "evidence")
  })

  it("is undefined when everything is complete", () => {
    assert.equal(nextStep([step("a", "urgent", { status: "completed" })]), undefined)
  })
})

describe("openPriority", () => {
  it("counts only open steps", () => {
    const plan = [step("a", "urgent"), step("b", "urgent", { status: "completed" }), step("c", "high"), step("d", "normal")]
    assert.deepEqual(openPriority(plan), { urgent: 1, high: 1, open: 3 })
  })
})

describe("agentProvenance", () => {
  const ctx: AnalysisContext = {
    incident: {
      id: "inc",
      reference: "SL-1",
      title: "t",
      category: "upi_payment",
      description: "short",
      amount: 1,
      currency: "INR",
      occurredAt: "2026-10-16T10:00:00.000Z",
      reportedAt: "2026-10-16T10:00:00.000Z",
      updatedAt: "2026-10-16T10:00:00.000Z",
      paymentMethod: "UPI",
      hasAccountAccess: "yes",
      status: "reported",
      notes: [],
      isSample: false,
    },
    evidence: [],
    actions: [],
  }
  const stored = (agentId: AgentId, ai?: boolean): AgentFinding[] =>
    composeFindings(buildFindings(agentId, ctx), ai ? [{ title: "m", detail: "d", source: "ai_analysis" }] : undefined).map(
      (f, i) => ({ ...f, id: String(i), incidentId: "inc", agentId, createdAt: "" }),
    )

  it("labels each agent from what was actually stored", () => {
    for (const id of ["incident", "containment", "evidence", "recovery"] as const) {
      assert.equal(agentProvenance(stored(id, true), "foundry"), "ai", id)
      assert.equal(agentProvenance(stored(id), "foundry"), "fallback", id)
      assert.equal(agentProvenance(stored(id), "mock"), "template", id)
    }
    assert.equal(agentProvenance([], "foundry"), "none")
  })
})
