/**
 * A small FICTIONAL dataset for checking the app end to end. None of these
 * people, cases, transactions or reference numbers are real.
 *
 * Actions and findings are produced by the same playbooks as a live run, so
 * seeded cases look exactly like cases that went through the analysis.
 */
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { OFFICIAL_RESOURCES } from "@/lib/config/official-resources"
import { buildActionItems, buildFindings, idleAgentState, settleAgentStatus } from "@/lib/playbooks"
import type { DbTx } from "@/server/db"
import type { ActionItem, CaseStatus, EvidenceItem, Incident } from "@/types"

const MIN = 60_000

interface SeedCase {
  reference: string
  title: string
  category: Incident["category"]
  description: string
  amount: number
  paymentMethod: string
  transactionRef?: string
  hasAccountAccess: Incident["hasAccountAccess"]
  ongoing?: Incident["ongoing"]
  status: CaseStatus
  /** Minutes before "now" that the case was reported. */
  reportedMinutesAgo: number
  occurredMinutesBefore: number
  notes: string[]
  evidence: Pick<EvidenceItem, "name" | "kind" | "mimeType" | "size" | "description">[]
  analysed: boolean
  completed: string[]
  inProgress: string[]
}

const CASES: SeedCase[] = [
  {
    reference: "SL-SAMPLE-0001",
    title: "UPI collect request from a fake buyer",
    category: "upi_payment",
    description:
      "I listed an old sofa on a marketplace. A buyer said they would pay through UPI and sent a request that they said was to 'receive' the money. I approved it and ₹18,500 was debited instead. The buyer stopped replying.",
    amount: 18500,
    paymentMethod: "UPI app",
    hasAccountAccess: "yes",
    ongoing: "no",
    status: "user_action_required",
    reportedMinutesAgo: 18 * 60,
    occurredMinutesBefore: 28,
    notes: ["Called the bank's official number. They logged a complaint — waiting for the SMS with the complaint number."],
    evidence: [
      {
        name: "chat-with-buyer.png",
        kind: "image",
        mimeType: "image/png",
        size: 482_311,
        description: "Marketplace chat where the buyer asks me to approve the request",
      },
      {
        name: "upi-debit-sms.png",
        kind: "image",
        mimeType: "image/png",
        size: 156_020,
        description: "Bank SMS confirming the debit",
      },
    ],
    analysed: true,
    completed: ["contact-provider"],
    inProgress: ["preserve-evidence"],
  },
  {
    reference: "SL-SAMPLE-0002",
    title: "Fake KYC update link via SMS",
    category: "phishing",
    description:
      "Got an SMS saying my bank KYC would expire today, with a link. The page looked like my bank's login. After I entered my details, two card transactions totalling ₹42,000 happened within ten minutes.",
    amount: 42000,
    paymentMethod: "Debit card",
    transactionRef: "UTR 628104779213 (fictional)",
    hasAccountAccess: "yes",
    ongoing: "no",
    status: "reporting_in_progress",
    reportedMinutesAgo: 7 * 24 * 60,
    occurredMinutesBefore: 47,
    notes: [],
    evidence: [
      { name: "kyc-sms.png", kind: "image", mimeType: "image/png", size: 98_440, description: "The SMS with the link" },
      {
        name: "card-statement.pdf",
        kind: "pdf",
        mimeType: "application/pdf",
        size: 1_204_551,
        description: "Statement showing both debits",
      },
    ],
    analysed: true,
    completed: ["contact-provider", "check-devices", "call-1930", "preserve-evidence", "secure-credentials"],
    inProgress: ["file-ncrp"],
  },
  {
    reference: "SL-SAMPLE-0003",
    title: "Caller posing as a courier official",
    category: "impersonation",
    description:
      "A caller said a parcel in my name contained illegal items and transferred me to a 'police officer' on video who asked me to install an app. I hung up before paying anything.",
    amount: 0,
    paymentMethod: "Other",
    hasAccountAccess: "yes",
    ongoing: "unsure",
    status: "reported",
    reportedMinutesAgo: 40,
    occurredMinutesBefore: 21,
    notes: [],
    evidence: [],
    analysed: false,
    completed: [],
    inProgress: [],
  },
]

export const SAMPLE_PROFILE = {
  email: "demo.user@example.com",
  displayName: "Demo User",
  preferredLanguage: "English",
  city: "Bengaluru",
  phoneHint: "+91 ••••• ••210",
}

/** Upserts reference data (official resources). Safe to run repeatedly. */
export async function seedReferenceData(db: DbTx) {
  for (const r of OFFICIAL_RESOURCES) {
    const data = {
      organization: r.organization,
      name: r.name,
      purpose: r.purpose,
      relevance: r.relevance,
      kind: r.kind,
      url: r.url ?? null,
      phone: r.phone ?? null,
      note: r.note ?? null,
      verifiedAt: r.verification.status === "verified" ? new Date(r.verification.lastVerified) : null,
    }
    await db.officialResource.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } })
  }
}

/**
 * Restores the demo: reference data, the demo user's profile and the sample
 * cases. Everything the user created is deleted.
 */
export async function resetDemoData(db: DbTx) {
  await seedReferenceData(db)
  const existing = await db.user.findFirst({ orderBy: { createdAt: "asc" } })
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: SAMPLE_PROFILE })
    : await db.user.create({ data: SAMPLE_PROFILE })
  await seedSampleCases(db, user.id)
  return user
}

/** Removes all of the user's cases and recreates the sample ones. */
export async function seedSampleCases(db: DbTx, userId: string, now = Date.now()) {
  await db.incident.deleteMany({ where: { userId } })
  for (const seed of CASES) await seedCase(db, userId, seed, now)
}

async function seedCase(db: DbTx, userId: string, seed: SeedCase, now: number) {
  const reportedAt = now - seed.reportedMinutesAgo * MIN
  const at = (minutesAfterReport: number) => new Date(reportedAt + minutesAfterReport * MIN)
  const lastTouch = at(Math.min(seed.reportedMinutesAgo - 5, 6 * 60))

  const row = await db.incident.create({
    data: {
      userId,
      reference: seed.reference,
      title: seed.title,
      category: seed.category,
      description: seed.description,
      amount: seed.amount,
      currency: "INR",
      occurredAt: new Date(reportedAt - seed.occurredMinutesBefore * MIN),
      reportedAt: new Date(reportedAt),
      paymentMethod: seed.paymentMethod,
      transactionRef: seed.transactionRef,
      hasAccountAccess: seed.hasAccountAccess,
      ongoing: seed.ongoing,
      status: seed.status,
      isSample: true,
    },
  })
  const incidentId = row.id
  const events: {
    at: Date
    actor: "user" | "agent" | "system"
    agentId?: (typeof AGENT_ORDER)[number]
    title: string
    detail?: string
    tone?: "neutral" | "success" | "warning" | "info"
  }[] = [{ at: at(0), actor: "user", title: "Incident details provided", detail: seed.title, tone: "info" }]

  for (const [i, body] of seed.notes.entries()) {
    await db.caseNote.create({ data: { incidentId, body, createdAt: at(25 + i) } })
    events.push({ at: at(25 + i), actor: "user", title: "Note added" })
  }

  const evidence: EvidenceItem[] = []
  for (const [i, e] of seed.evidence.entries()) {
    const created = await db.evidenceItem.create({ data: { incidentId, ...e, isSample: true, addedAt: at(4 + i) } })
    evidence.push({ ...e, id: created.id, incidentId, addedAt: created.addedAt.toISOString(), isSample: true })
    events.push({ at: at(4 + i), actor: "user", title: "Evidence added", detail: e.name })
  }

  const idle = idleAgentState()
  if (!seed.analysed) {
    await db.agentState.createMany({
      data: AGENT_ORDER.map((agentId) => ({
        incidentId,
        agentId,
        status: idle[agentId].status,
        currentTask: idle[agentId].currentTask,
      })),
    })
  } else {
    const incident: Incident = {
      id: incidentId,
      reference: row.reference,
      title: row.title,
      category: row.category,
      description: row.description,
      amount: seed.amount,
      currency: row.currency,
      occurredAt: row.occurredAt.toISOString(),
      reportedAt: row.reportedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      paymentMethod: row.paymentMethod,
      transactionRef: seed.transactionRef,
      hasAccountAccess: row.hasAccountAccess,
      ongoing: seed.ongoing,
      status: row.status,
      notes: [],
      isSample: true,
    }

    // Apply the recorded task progress first so findings reflect it.
    let offset = 30
    const actions: ActionItem[] = buildActionItems(incident, at(2).toISOString(), () => "").map((a) => {
      if (seed.completed.includes(a.key)) {
        const doneAt = at((offset += 20))
        events.push({ at: doneAt, actor: "user", title: "Task marked complete", detail: a.title, tone: "success" })
        return { ...a, status: "completed", completedAt: doneAt.toISOString(), updatedAt: doneAt.toISOString() }
      }
      if (seed.inProgress.includes(a.key)) {
        const startedAt = at((offset += 10))
        events.push({ at: startedAt, actor: "user", title: "Task started", detail: a.title, tone: "info" })
        return { ...a, status: "in_progress", updatedAt: startedAt.toISOString() }
      }
      return a
    })
    await db.actionItem.createMany({
      data: actions.map((a, i) => ({
        incidentId,
        key: a.key,
        title: a.title,
        explanation: a.explanation,
        priority: a.priority,
        status: a.status,
        origin: a.origin,
        timing: a.timing,
        instructions: a.instructions,
        requiredInfo: a.requiredInfo,
        dependsOn: a.dependsOn ?? [],
        resourceId: a.resourceId,
        createdAt: new Date(at(2).getTime() + i),
        updatedAt: new Date(a.updatedAt),
        completedAt: a.completedAt ? new Date(a.completedAt) : null,
      })),
    })

    const run = await db.analysisRun.create({
      data: { incidentId, engine: "mock", status: "completed", startedAt: at(1), completedAt: at(1 + AGENT_ORDER.length) },
    })
    const ctx = { incident, evidence, actions }
    events.push({
      at: at(1),
      actor: "system",
      title: "Simulated analysis started",
      detail: "Demo workflow — no AI model is called",
      tone: "info",
    })
    for (const [i, agentId] of AGENT_ORDER.entries()) {
      const doneAt = at(2 + i)
      await db.agentFinding.createMany({
        data: buildFindings(agentId, ctx).map((f, position) => ({
          incidentId,
          runId: run.id,
          agentId,
          position,
          title: f.title,
          detail: f.detail,
          source: f.source,
          items: f.items ?? [],
          confidence: f.confidence,
          createdAt: doneAt,
        })),
      })
      const settled = settleAgentStatus(agentId, ctx)
      await db.agentState.create({
        data: { incidentId, agentId, ...settled, startedAt: at(1 + i), completedAt: doneAt },
      })
      if (agentId === "containment") {
        events.push({
          at: doneAt,
          actor: "agent",
          agentId,
          title: "Action plan generated",
          detail: `${actions.length} suggested steps`,
          tone: "info",
        })
      }
      events.push({
        at: doneAt,
        actor: "agent",
        agentId,
        title: `${AGENTS[agentId].name}: ${settled.currentTask}`,
        tone: settled.status === "completed" ? "success" : "warning",
      })
      if (agentId === "evidence" && !seed.transactionRef) {
        events.push({ at: doneAt, actor: "agent", agentId, title: "Missing transaction reference identified", tone: "warning" })
      }
    }
  }

  await db.timelineEvent.createMany({
    data: events.map((e, i) => ({ incidentId, ...e, at: new Date(e.at.getTime() + i), tone: e.tone ?? "neutral" })),
  })
  // Set last so @updatedAt doesn't overwrite it with the seed time.
  await db.$executeRaw`UPDATE incidents SET "updatedAt" = ${seed.analysed ? lastTouch : at(0)} WHERE id = ${incidentId}::uuid`
}
