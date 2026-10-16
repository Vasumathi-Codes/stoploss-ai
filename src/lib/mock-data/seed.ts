/**
 * FICTIONAL demo dataset. None of these people, cases, transactions or reference
 * numbers are real. The seed is built with the same playbook functions the
 * simulation uses, so seeded and newly created cases are consistent.
 */
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { buildActionItems, buildFindings, idleAgentState, settleAgentStatus } from "@/lib/services/mock/playbooks"
import type { DemoState } from "@/lib/store/demo-store"
import { addMinutes } from "@/lib/utils/format"
import type { ActionItem, AgentFinding, CaseTimelineEvent, EvidenceItem, Incident, IncidentAgentState } from "@/types"

interface SeedCase {
  incident: Incident
  evidence: Omit<EvidenceItem, "incidentId" | "isSample">[]
  analysed: boolean
  completed: string[]
  inProgress: string[]
}

const SEED_CASES: SeedCase[] = [
  {
    incident: {
      id: "inc_4821",
      reference: "SL-2610-4821",
      title: "UPI collect request from a fake buyer",
      category: "upi_payment",
      description:
        "I listed an old sofa on a marketplace. A buyer said they would pay through UPI and sent a request that they said was to 'receive' the money. I entered my PIN and ₹18,500 was debited instead. The buyer stopped replying.",
      amount: 18500,
      currency: "INR",
      occurredAt: "2026-10-15T13:52:00.000Z",
      reportedAt: "2026-10-15T14:20:00.000Z",
      updatedAt: "2026-10-16T05:05:00.000Z",
      paymentMethod: "UPI app",
      hasAccountAccess: "yes",
      ongoing: "no",
      status: "user_action_required",
      notes: [
        {
          id: "note_4821_1",
          body: "Called the bank's official number at 8:10 pm. They logged a complaint. Waiting for the SMS with the complaint number.",
          createdAt: "2026-10-15T14:45:00.000Z",
        },
      ],
      isSample: true,
    },
    evidence: [
      {
        id: "ev_4821_1",
        name: "chat-with-buyer.png",
        kind: "image",
        mimeType: "image/png",
        size: 482_311,
        addedAt: "2026-10-15T14:24:00.000Z",
        description: "Marketplace chat where the buyer asks me to approve the request",
      },
      {
        id: "ev_4821_2",
        name: "upi-debit-sms.png",
        kind: "image",
        mimeType: "image/png",
        size: 156_020,
        addedAt: "2026-10-15T14:25:00.000Z",
        description: "Bank SMS confirming the debit",
      },
    ],
    analysed: true,
    completed: ["contact-provider"],
    inProgress: ["preserve-evidence"],
  },
  {
    incident: {
      id: "inc_3307",
      reference: "SL-2610-3307",
      title: "Fake KYC update link via SMS",
      category: "phishing",
      description:
        "Got an SMS saying my bank KYC would expire today with a link. The page looked like my bank's login. After I entered my details and an OTP, two card transactions totalling ₹42,000 happened within ten minutes.",
      amount: 42000,
      currency: "INR",
      occurredAt: "2026-10-09T04:15:00.000Z",
      reportedAt: "2026-10-09T05:02:00.000Z",
      updatedAt: "2026-10-14T10:30:00.000Z",
      paymentMethod: "Debit card",
      transactionRef: "UTR 628104779213 (fictional)",
      hasAccountAccess: "yes",
      ongoing: "no",
      status: "reporting_in_progress",
      notes: [],
      isSample: true,
    },
    evidence: [
      {
        id: "ev_3307_1",
        name: "kyc-sms.png",
        kind: "image",
        mimeType: "image/png",
        size: 98_440,
        addedAt: "2026-10-09T05:06:00.000Z",
        description: "The SMS with the link",
      },
      {
        id: "ev_3307_2",
        name: "fake-login-page.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        size: 734_002,
        addedAt: "2026-10-09T05:07:00.000Z",
      },
      {
        id: "ev_3307_3",
        name: "card-statement-oct.pdf",
        kind: "pdf",
        mimeType: "application/pdf",
        size: 1_204_551,
        addedAt: "2026-10-10T08:12:00.000Z",
        description: "Statement showing both debits",
      },
    ],
    analysed: true,
    completed: ["contact-provider", "check-devices", "call-1930", "preserve-evidence", "secure-credentials", "record-references"],
    inProgress: ["file-ncrp"],
  },
  {
    incident: {
      id: "inc_1182",
      reference: "SL-2609-1182",
      title: "Trading group asking for withdrawal fees",
      category: "investment",
      description:
        "Joined a messaging group sharing stock tips. They moved me to a trading website that showed my ₹1,00,000 growing quickly. When I tried to withdraw, they asked for ₹25,000 as tax. I paid it, then they asked for more.",
      amount: 125000,
      currency: "INR",
      occurredAt: "2026-09-26T09:30:00.000Z",
      reportedAt: "2026-09-28T06:40:00.000Z",
      updatedAt: "2026-10-02T12:00:00.000Z",
      paymentMethod: "Bank transfer (IMPS/NEFT/RTGS)",
      transactionRef: "IMPS 726915003318 (fictional)",
      hasAccountAccess: "yes",
      ongoing: "unsure",
      status: "action_plan_ready",
      notes: [],
      isSample: true,
    },
    evidence: [
      {
        id: "ev_1182_1",
        name: "group-chat-export.txt",
        kind: "text",
        mimeType: "text/plain",
        size: 18_220,
        addedAt: "2026-09-28T06:48:00.000Z",
        description: "Exported group messages",
        textPreview: "[Sample record — no file attached in this demo]",
      },
      {
        id: "ev_1182_2",
        name: "platform-dashboard.png",
        kind: "image",
        mimeType: "image/png",
        size: 611_300,
        addedAt: "2026-09-28T06:50:00.000Z",
      },
      {
        id: "ev_1182_3",
        name: "imps-receipts.pdf",
        kind: "pdf",
        mimeType: "application/pdf",
        size: 402_118,
        addedAt: "2026-09-28T06:53:00.000Z",
      },
    ],
    analysed: true,
    completed: ["stop-further-payments", "preserve-evidence"],
    inProgress: [],
  },
  {
    incident: {
      id: "inc_0954",
      reference: "SL-2609-0954",
      title: "Phone bought online never delivered",
      category: "shopping",
      description:
        "Paid a seller on a social marketplace for a used phone after seeing photos and a courier receipt. Nothing arrived and the seller's profile disappeared two days later.",
      amount: 7999,
      currency: "INR",
      occurredAt: "2026-09-10T11:00:00.000Z",
      reportedAt: "2026-09-14T03:30:00.000Z",
      updatedAt: "2026-09-25T09:15:00.000Z",
      paymentMethod: "Marketplace or social app",
      transactionRef: "UPI ref 425317889012 (fictional)",
      hasAccountAccess: "yes",
      ongoing: "no",
      status: "resolved",
      notes: [
        {
          id: "note_0954_1",
          body: "Marked resolved after filing all reports. Keeping the case for my records.",
          createdAt: "2026-09-25T09:15:00.000Z",
        },
      ],
      isSample: true,
    },
    evidence: [
      {
        id: "ev_0954_1",
        name: "seller-listing.png",
        kind: "image",
        mimeType: "image/png",
        size: 344_870,
        addedAt: "2026-09-14T03:36:00.000Z",
      },
      {
        id: "ev_0954_2",
        name: "payment-receipt.pdf",
        kind: "pdf",
        mimeType: "application/pdf",
        size: 88_301,
        addedAt: "2026-09-14T03:38:00.000Z",
      },
    ],
    analysed: true,
    completed: [
      "contact-provider",
      "report-platform",
      "call-1930",
      "preserve-evidence",
      "secure-credentials",
      "file-ncrp",
      "record-references",
      "escalate-rbi",
    ],
    inProgress: [],
  },
  {
    incident: {
      id: "inc_5560",
      reference: "SL-2610-5560",
      title: "Caller posing as a courier official",
      category: "impersonation",
      description:
        "A caller said a parcel in my name contained illegal items and transferred me to a 'police officer' on video who asked me to install an app. I hung up before paying anything but I did share my Aadhaar number.",
      amount: 0,
      currency: "INR",
      occurredAt: "2026-10-16T03:20:00.000Z",
      reportedAt: "2026-10-16T03:41:00.000Z",
      updatedAt: "2026-10-16T03:41:00.000Z",
      paymentMethod: "Other",
      hasAccountAccess: "yes",
      ongoing: "unsure",
      status: "reported",
      notes: [],
      isSample: true,
    },
    evidence: [],
    analysed: false,
    completed: [],
    inProgress: [],
  },
]

function buildCase(seed: SeedCase) {
  const { incident } = seed
  const at = incident.reportedAt
  const evidence: EvidenceItem[] = seed.evidence.map((e) => ({ ...e, incidentId: incident.id, isSample: true }))
  const timeline: CaseTimelineEvent[] = []
  let n = 0
  const event = (minutesAfter: number, e: Omit<CaseTimelineEvent, "id" | "incidentId" | "at">, absolute?: string) => {
    timeline.push({
      id: `evt_${incident.id}_${++n}`,
      incidentId: incident.id,
      at: absolute ?? addMinutes(at, minutesAfter),
      ...e,
    })
  }

  event(0, { actor: "user", title: "Incident details provided", detail: incident.title, tone: "info" })

  let actions: ActionItem[] = []
  const findings: AgentFinding[] = []
  const agentState: IncidentAgentState = idleAgentState()

  if (seed.analysed) {
    let k = 0
    // Apply the user's recorded progress first so findings reflect it.
    let offset = 20
    actions = buildActionItems(incident, addMinutes(at, 2), () => `act_${incident.id}_${++k}`).map((a) => {
      if (seed.completed.includes(a.key)) {
        const completedAt = addMinutes(at, (offset += 25))
        event(0, { actor: "user", title: "Task marked complete", detail: a.title, tone: "success" }, completedAt)
        return { ...a, status: "completed", completedAt, updatedAt: completedAt }
      }
      if (seed.inProgress.includes(a.key)) {
        const startedAt = addMinutes(at, (offset += 15))
        event(0, { actor: "user", title: "Task started", detail: a.title }, startedAt)
        return { ...a, status: "in_progress", updatedAt: startedAt }
      }
      return a
    })
    const ctx = { incident, evidence, actions }
    AGENT_ORDER.forEach((agentId, i) => {
      const done = addMinutes(at, 1 + i)
      buildFindings(agentId, ctx).forEach((f, j) => {
        findings.push({ ...f, id: `fnd_${incident.id}_${agentId}_${j}`, incidentId: incident.id, agentId, createdAt: done })
      })
      const settled = settleAgentStatus(agentId, ctx)
      agentState[agentId] = { ...settled, startedAt: addMinutes(at, i), completedAt: done }
      event(1 + i, {
        actor: "agent",
        agentId,
        title: `${AGENTS[agentId].name}: ${settled.currentTask}`,
        tone: settled.status === "completed" ? "success" : "warning",
      })
    })
    event(5, { actor: "system", title: "Action plan generated", detail: `${actions.length} suggested steps`, tone: "info" })
  }

  evidence.forEach((e) => event(0, { actor: "user", title: "Evidence added", detail: e.name }, e.addedAt))
  incident.notes.forEach((note) => event(0, { actor: "user", title: "Note added" }, note.createdAt))
  if (!incident.transactionRef && seed.analysed) {
    event(4, { actor: "agent", agentId: "evidence", title: "Missing transaction reference identified", tone: "warning" })
  }
  if (incident.status === "resolved") {
    event(0, { actor: "user", title: "Case marked as resolved", tone: "success" }, incident.updatedAt)
  }

  return { incident, evidence, actions, findings, timeline, agentState }
}

export const DEMO_PROFILE = {
  displayName: "Demo User",
  email: "demo.user@example.com",
  preferredLanguage: "English",
  city: "Bengaluru",
  phoneHint: "+91 ••••• ••210",
}

export function createSeedState(): DemoState {
  const built = SEED_CASES.map((s) => buildCase({ ...s, incident: { ...s.incident, notes: [...s.incident.notes] } }))
  return {
    incidents: built.map((b) => b.incident),
    evidence: built.flatMap((b) => b.evidence),
    actions: built.flatMap((b) => b.actions),
    findings: built.flatMap((b) => b.findings),
    timeline: built.flatMap((b) => b.timeline).sort((a, b) => b.at.localeCompare(a.at)),
    agentStates: Object.fromEntries(built.map((b) => [b.incident.id, b.agentState])),
    profile: { ...DEMO_PROFILE },
    readEventIds: [],
  }
}
