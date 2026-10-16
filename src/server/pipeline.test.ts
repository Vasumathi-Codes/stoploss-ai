import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

import OpenAI from "openai"

import { type AnalysisContext, buildFindings, type FindingDraft } from "@/lib/playbooks"
import { runFoundryAgent, type PriorFinding } from "@/server/foundry/agents"
import { describeFoundryError, type FoundryConfig } from "@/server/foundry/client"
import { AGENT_STAGES, type AgentOutcome, composeFindings, runStages, settleAgentOutcome } from "@/server/pipeline"
import type { AgentId } from "@/types"

const live = async () => true

describe("runStages", () => {
  it("runs Incident first, Containment and Evidence in parallel, Recovery last", async () => {
    const log: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const ok = await runStages<string>(async (agentId) => {
      log.push(`start:${agentId}`)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      log.push(`end:${agentId}`)
      return [agentId]
    }, live)

    assert.equal(ok, true)
    assert.equal(maxInFlight, 2)
    assert.deepEqual(log.slice(0, 2), ["start:incident", "end:incident"])
    assert.deepEqual(log.slice(-2), ["start:recovery", "end:recovery"])
    assert.deepEqual(log.slice(2, 4).sort(), ["start:containment", "start:evidence"])
  })

  it("passes each stage only the output of earlier stages", async () => {
    const seen: Partial<Record<AgentId, readonly string[]>> = {}
    await runStages<string>(async (agentId, prior) => {
      seen[agentId] = prior
      return [agentId]
    }, live)

    assert.deepEqual(seen.incident, [])
    assert.deepEqual(seen.containment, ["incident"])
    assert.deepEqual(seen.evidence, ["incident"], "parallel agents don't see each other's output")
    assert.deepEqual([...(seen.recovery ?? [])].sort(), ["containment", "evidence", "incident"])
  })

  it("stops when the run is cancelled between stages", async () => {
    const ran: AgentId[] = []
    let checks = 0
    const ok = await runStages<string>(
      async (agentId) => {
        ran.push(agentId)
        return []
      },
      async () => ++checks <= 1,
    )
    assert.equal(ok, false)
    assert.deepEqual(ran, ["incident"])
  })

  it("propagates a failing step so the run can be marked failed", async () => {
    await assert.rejects(
      runStages<string>(async (agentId) => {
        if (agentId === "evidence") throw new Error("db down")
        return []
      }, live),
      /db down/,
    )
  })

  it("covers all four agents exactly once", () => {
    assert.deepEqual(AGENT_STAGES.flat().sort(), ["containment", "evidence", "incident", "recovery"])
  })
})

const fact: FindingDraft = { title: "You reported", detail: "Rs 15,000 via UPI", source: "user_supplied" }
const guidance: FindingDraft = { title: "Call 1930", detail: "Helpline", source: "verified_guidance" }
const mockFinding: FindingDraft = { title: "Template", detail: "Simulated", source: "mock_analysis" }
const aiFinding: FindingDraft = { title: "Model", detail: "From Foundry", source: "ai_analysis" }

describe("composeFindings", () => {
  it("uses the full template output when there is no model output", () => {
    assert.deepEqual(composeFindings([mockFinding, fact], undefined), [mockFinding, fact])
  })

  it("puts model findings first and keeps only the template's factual findings", () => {
    assert.deepEqual(composeFindings([mockFinding, fact, guidance], [aiFinding]), [aiFinding, fact, guidance])
  })
})

describe("settleAgentOutcome", () => {
  const completed = { status: "completed" as const, currentTask: "Done" }

  it("leaves template runs unchanged", () => {
    assert.deepEqual(settleAgentOutcome(completed, { engine: "mock" }), completed)
  })

  it("flags a Foundry fallback for review instead of reporting success", () => {
    const settled = settleAgentOutcome(completed, { engine: "foundry", failure: "The request timed out" })
    assert.equal(settled.status, "needs_review")
    assert.match(settled.currentTask, /template output/)
  })

  it("surfaces the model's own review request", () => {
    const settled = settleAgentOutcome(completed, { engine: "foundry", ai: { review: "x".repeat(300) } })
    assert.equal(settled.status, "needs_review")
    assert.equal(settled.currentTask.length, 140)
  })

  it("keeps missing-information states, which take priority", () => {
    const awaiting = { status: "awaiting_information" as const, currentTask: "Need transaction reference" }
    assert.deepEqual(settleAgentOutcome(awaiting, { engine: "foundry", failure: "x" }), awaiting)
  })
})

describe("orchestration with Foundry (fake model, no network or database)", () => {
  const config: FoundryConfig = {
    endpoint: "https://example.invalid/openai/v1/",
    deployment: "d",
    auth: "api-key",
    timeoutMs: 1000,
  }
  const ctx: AnalysisContext = {
    incident: {
      id: "inc-1",
      reference: "SL-2610-0001",
      title: "Fake KYC call",
      category: "upi_payment",
      description: "A caller asked me to approve a UPI collect request.",
      amount: 15000,
      currency: "INR",
      occurredAt: "2026-10-15T10:00:00.000Z",
      reportedAt: "2026-10-15T11:00:00.000Z",
      updatedAt: "2026-10-15T11:00:00.000Z",
      paymentMethod: "UPI",
      hasAccountAccess: "yes",
      status: "reported",
      notes: [],
      isSample: false,
    },
    evidence: [],
    actions: [],
  }
  const ok = (title: string) =>
    JSON.stringify({
      findings: [{ title, detail: "Analysis.", source: "ai_analysis", items: [], confidence: null }],
      needsReview: false,
      reviewReason: null,
    })

  /** Mirrors executeRun's per-agent flow, with each agent's model behaviour scripted. */
  async function simulateRun(behaviour: Record<AgentId, () => Promise<string>>) {
    const stored: Partial<Record<AgentId, FindingDraft[]>> = {}
    const outcomes: Partial<Record<AgentId, AgentOutcome>> = {}
    const priorSeen: Partial<Record<AgentId, string[]>> = {}
    const logs: string[] = []
    const error = mock.method(console, "error", (...a: unknown[]) => void logs.push(a.join(" ")))
    const info = mock.method(console, "info", () => undefined)
    try {
      await runStages<PriorFinding>(
        async (agentId, prior) => {
          priorSeen[agentId] = prior.map((f) => f.agentId)
          const client = {
            responses: {
              create: async () => ({ id: `resp_${agentId}`, status: "completed", output_text: await behaviour[agentId]() }),
            },
          } as unknown as Parameters<typeof runFoundryAgent>[6]
          let ai: FindingDraft[] | undefined
          try {
            const result = await runFoundryAgent(config, agentId, ctx, [], [...prior], "run-1", client)
            ai = result.findings
            outcomes[agentId] = { engine: "foundry", ai: result }
          } catch (e) {
            const { kind, message } = describeFoundryError(e)
            console.error(`[foundry] run=run-1 agent=${agentId} failed: ${kind}`)
            outcomes[agentId] = { engine: "foundry", failure: message }
          }
          stored[agentId] = composeFindings(buildFindings(agentId, ctx), ai)
          return ai ? ai.map((f) => ({ ...f, agentId })) : []
        },
        async () => true,
      )
    } finally {
      error.mock.restore()
      info.mock.restore()
    }
    return { stored, outcomes, priorSeen, logs }
  }

  it("runs all four agents on Foundry and passes model findings forward", async () => {
    const { stored, outcomes, priorSeen } = await simulateRun({
      incident: async () => ok("Incident"),
      containment: async () => ok("Containment"),
      evidence: async () => ok("Evidence"),
      recovery: async () => ok("Recovery"),
    })
    for (const id of AGENT_STAGES.flat()) {
      assert.ok(outcomes[id] && "ai" in outcomes[id], id)
      assert.equal(stored[id]?.[0].source, "ai_analysis")
      assert.ok(
        stored[id]?.every((f) => f.source !== "mock_analysis"),
        "template analysis is replaced, facts kept",
      )
    }
    assert.deepEqual([...(priorSeen.recovery ?? [])].sort(), ["containment", "evidence", "incident"])
  })

  it("falls back per agent on timeout, malformed output and API errors, and the run continues", async () => {
    const { stored, outcomes, priorSeen, logs } = await simulateRun({
      incident: async () => ok("Incident"),
      containment: async () => {
        throw new OpenAI.APIConnectionTimeoutError()
      },
      evidence: async () => "Sure! Here are the findings: ...",
      recovery: async () => {
        throw OpenAI.APIError.generate(401, { error: { message: "key sk-secret" } }, "key sk-secret", new Headers())
      },
    })
    assert.deepEqual(outcomes.containment, { engine: "foundry", failure: "The request timed out" })
    assert.deepEqual(outcomes.evidence, { engine: "foundry", failure: "The model returned output that failed validation" })
    assert.deepEqual(outcomes.recovery, { engine: "foundry", failure: "Microsoft Foundry rejected the credentials (HTTP 401)" })

    // Fallback agents store the full template output, with no AI-labelled findings.
    for (const id of ["containment", "evidence", "recovery"] as const) {
      assert.deepEqual(stored[id], buildFindings(id, ctx))
      assert.ok(!stored[id]?.some((f) => f.source === "ai_analysis"))
      assert.equal(settleAgentOutcome({ status: "completed", currentTask: "" }, outcomes[id]!).status, "needs_review")
    }
    // Only successful model output is passed forward.
    assert.deepEqual(priorSeen.recovery, ["incident"])
    // Logs carry the classification only.
    assert.equal(logs.length, 3)
    assert.ok(logs.every((l) => !l.includes("sk-secret") && !l.includes("collect request")))
  })
})
