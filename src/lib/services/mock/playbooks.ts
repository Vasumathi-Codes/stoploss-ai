/**
 * Deterministic templates used by the mock agent simulation.
 *
 * Everything here is fixed, general guidance selected by simple rules — it is NOT
 * the output of an AI model. When Microsoft Foundry is integrated, the real
 * agents replace `buildActionItems` / `buildFindings` behind the AgentService.
 */
import { AGENTS } from "@/lib/config/agents"
import { getOfficialResource } from "@/lib/config/official-resources"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"
import type {
  ActionItem,
  AgentFinding,
  AgentId,
  AgentRunState,
  EvidenceItem,
  FraudCategory,
  Incident,
  IncidentAgentState,
} from "@/types"

type ActionTemplate = Omit<ActionItem, "id" | "incidentId" | "status" | "updatedAt" | "completedAt">

const COMMON: Record<string, ActionTemplate> = {
  "contact-provider": {
    key: "contact-provider",
    title: "Contact your bank or payment provider through its official channel",
    explanation:
      "Tell them about the transaction you did not authorise and ask what they can do on their side, such as blocking a card, UPI or net-banking access.",
    priority: "urgent",
    origin: "external",
    timing: "As soon as you can",
    instructions: [
      "Find the support number on your card, passbook or the provider's official app — not from a search ad, SMS or social media.",
      "Explain what happened and share the transaction details you have.",
      "Ask for a complaint or reference number and note the date and time of the call.",
      "Never share an OTP, UPI PIN, CVV or password, even if the caller says it is required.",
    ],
    requiredInfo: ["Transaction date, time and amount", "Transaction reference (UTR/RRN) if available"],
    resourceId: "bank-official",
  },
  "call-1930": {
    key: "call-1930",
    title: "Consider reporting the loss to the cybercrime helpline",
    explanation:
      "The national helpline handles reports of financial cyber fraud. Calling early means your report is on record while details are fresh.",
    priority: "urgent",
    origin: "external",
    timing: "Soon after noticing the loss",
    instructions: [
      "Keep your transaction details and the other party's identifiers (phone number, UPI ID, link) to hand.",
      "Write down any acknowledgement or reference number you are given.",
      "Add that number to this case's notes so you can find it later.",
    ],
    requiredInfo: ["Transaction details", "Other party's phone number, UPI ID or account name"],
    resourceId: "helpline-1930",
  },
  "preserve-evidence": {
    key: "preserve-evidence",
    title: "Preserve transaction references and evidence",
    explanation: "Screenshots, messages and reference numbers can disappear. Saving them now makes every later step easier.",
    priority: "high",
    origin: "suggested",
    timing: "Today, before details are lost",
    instructions: [
      "Take screenshots of the payment confirmation, chats, call log and any website or profile involved.",
      "Note the transaction reference (UTR/RRN) from your bank SMS or payment app history.",
      "Add the files to this case's Evidence tab. In this demo they stay in your browser only.",
    ],
    requiredInfo: [],
  },
  "secure-credentials": {
    key: "secure-credentials",
    title: "Review whether your account credentials need to be secured",
    explanation:
      "If you shared a password, entered details on a suspicious page or installed an app on request, changing credentials may prevent further misuse.",
    priority: "high",
    origin: "suggested",
    timing: "Today",
    instructions: [
      "From a device you trust, change the password of the affected account and your email.",
      "Turn on two-step verification where it is available.",
      "Review recently linked devices and remove any you don't recognise.",
    ],
    requiredInfo: [],
  },
  "file-ncrp": {
    key: "file-ncrp",
    title: "Prepare and file an official cybercrime complaint",
    explanation:
      "Use your organised case details to file a complaint through the official portal. STOPLOSS AI cannot file it for you.",
    priority: "high",
    origin: "external",
    timing: "Once your evidence is organised",
    instructions: [
      "Open the Recovery Coordinator's complaint checklist on this case.",
      "Have your evidence files and a short timeline of events ready.",
      "After filing, save the acknowledgement number in this case's notes.",
    ],
    requiredInfo: ["Short timeline of events", "Evidence files", "Transaction details"],
    resourceId: "ncrp",
    dependsOn: ["preserve-evidence"],
  },
  "record-references": {
    key: "record-references",
    title: "Record every complaint or reference number you receive",
    explanation: "Keeping all reference numbers in one place helps when you need to follow up with a bank or authority.",
    priority: "normal",
    origin: "suggested",
    timing: "Each time you contact an organisation",
    instructions: ["Add each reference number, with who gave it and when, to this case's notes."],
    requiredInfo: [],
    dependsOn: ["contact-provider"],
  },
  "escalate-rbi": {
    key: "escalate-rbi",
    title: "Escalate to the regulator if your bank's response is unsatisfactory",
    explanation:
      "If your complaint to a regulated entity is not resolved, there may be an escalation route through the regulator.",
    priority: "normal",
    origin: "external",
    timing: "Only if the bank's response doesn't resolve your complaint",
    instructions: [
      "Keep your bank complaint number and their written response.",
      "Check the regulator's portal for eligibility and the information required.",
    ],
    requiredInfo: ["Bank complaint reference number", "Bank's response"],
    resourceId: "rbi-cms",
    dependsOn: ["contact-provider"],
  },
}

const CATEGORY_SPECIFIC: Partial<Record<FraudCategory, ActionTemplate[]>> = {
  phishing: [
    {
      key: "check-devices",
      title: "Remove suspicious apps and review device permissions",
      explanation: "Malicious links sometimes lead to apps that read SMS or allow remote access.",
      priority: "high",
      origin: "suggested",
      timing: "Today",
      instructions: [
        "Uninstall any app you installed because of the link or call.",
        "Review apps with SMS, accessibility or screen-sharing permissions.",
      ],
      requiredInfo: [],
    },
  ],
  impersonation: [
    {
      key: "report-communication",
      title: "Report the fraudulent call or message",
      explanation: "Reporting the number that contacted you can help others avoid the same scam.",
      priority: "normal",
      origin: "external",
      timing: "When you have a moment",
      instructions: ["Note the number, time and what the caller claimed to be.", "Use the official telecom reporting channel."],
      requiredInfo: ["Caller's number", "Date and time of the call"],
      resourceId: "sanchar-saathi",
    },
  ],
  account_takeover: [
    {
      key: "recover-account",
      title: "Recover access to the affected account through official recovery",
      explanation: "Regaining control limits further misuse of the account.",
      priority: "urgent",
      origin: "suggested",
      timing: "As soon as you can",
      instructions: [
        "Use the service's official account-recovery page, typed directly into your browser.",
        "After recovery, sign out of all other sessions and change the password.",
      ],
      requiredInfo: [],
    },
  ],
  investment: [
    {
      key: "stop-further-payments",
      title: "Pause any further payments to unlock withdrawals",
      explanation: "Requests for taxes or fees before releasing funds are a common pattern in investment scams.",
      priority: "urgent",
      origin: "suggested",
      timing: "Now",
      instructions: [
        "Don't send more money while you review the situation.",
        "Save the group chats, platform URL and payment details as evidence.",
      ],
      requiredInfo: [],
    },
  ],
  shopping: [
    {
      key: "report-platform",
      title: "Report the seller or listing to the marketplace",
      explanation: "Platforms may have their own dispute processes and can act on the account.",
      priority: "normal",
      origin: "external",
      timing: "Within the platform's dispute window, if it has one",
      instructions: ["Use the platform's in-app help or report option.", "Attach the listing and chat screenshots."],
      requiredInfo: ["Listing link or seller profile"],
    },
  ],
  banking_card: [
    {
      key: "block-card",
      title: "Ask your bank to block the affected card",
      explanation: "Blocking stops new transactions on that card. Only your bank can do this.",
      priority: "urgent",
      origin: "external",
      timing: "As soon as you can",
      instructions: ["Use your bank's official app or the number on the back of your card.", "Ask about a replacement card."],
      requiredInfo: [],
      resourceId: "bank-official",
    },
  ],
}

export function getActionTemplates(incident: Incident): ActionTemplate[] {
  const list: ActionTemplate[] = []
  const lostMoney = incident.amount > 0
  if (lostMoney) list.push(COMMON["contact-provider"])
  list.push(...(CATEGORY_SPECIFIC[incident.category] ?? []))
  if (lostMoney) list.push(COMMON["call-1930"])
  list.push(COMMON["preserve-evidence"])
  const credentialRisk =
    incident.category === "account_takeover" || incident.category === "phishing" || incident.hasAccountAccess !== "yes"
  list.push(credentialRisk ? { ...COMMON["secure-credentials"], priority: "urgent" } : COMMON["secure-credentials"])
  list.push(COMMON["file-ncrp"])
  if (lostMoney) {
    list.push(COMMON["record-references"])
    list.push(COMMON["escalate-rbi"])
  }
  return list
}

export function buildActionItems(incident: Incident, at: string, makeId: () => string): ActionItem[] {
  return getActionTemplates(incident).map((t) => ({
    ...t,
    id: makeId(),
    incidentId: incident.id,
    status: "pending",
    updatedAt: at,
  }))
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

export interface AnalysisContext {
  incident: Incident
  evidence: EvidenceItem[]
  actions: ActionItem[]
}

export function getMissingInformation({ incident, evidence }: AnalysisContext) {
  const missing: string[] = []
  if (!incident.transactionRef) missing.push("Transaction reference (UTR/RRN)")
  if (evidence.length === 0) missing.push("Any screenshots or documents")
  if (incident.hasAccountAccess === "unsure") missing.push("Whether you still have access to the affected account")
  if (incident.description.trim().length < 60) missing.push("A little more detail about how the contact started")
  return missing
}

type FindingDraft = Omit<AgentFinding, "id" | "incidentId" | "agentId" | "createdAt">

export function buildFindings(agentId: AgentId, ctx: AnalysisContext): FindingDraft[] {
  const { incident, evidence, actions } = ctx
  const category = FRAUD_CATEGORIES[incident.category]
  const amount = formatCurrency(incident.amount, incident.currency)

  switch (agentId) {
    case "incident": {
      const missing = getMissingInformation(ctx)
      return [
        {
          title: "Summary of the described event",
          detail: `You described a suspected ${category.label.toLowerCase()} involving approximately ${amount} via ${incident.paymentMethod.toLowerCase()}, around ${formatDateTime(incident.occurredAt)}.`,
          source: "mock_analysis",
        },
        {
          title: "Your account of what happened",
          detail: incident.description,
          source: "user_supplied",
        },
        {
          title: `Suspected category: ${category.short}`,
          detail:
            "Taken from the category you selected. The demo does not interpret your description, and this is not a determination of what legally happened.",
          source: "unverified_assumption",
          confidence: incident.description.length > 120 ? "medium" : "low",
        },
        missing.length > 0
          ? {
              title: "Missing information",
              detail: "Adding these would make the case clearer for any organisation you contact.",
              source: "mock_analysis",
              items: missing,
            }
          : {
              title: "No obvious gaps",
              detail: "The core details for an initial report appear to be present.",
              source: "mock_analysis",
            },
      ]
    }
    case "containment": {
      const priority = actions.filter((a) => a.priority === "urgent" || a.priority === "high")
      return [
        {
          title: "Priority checklist",
          detail: "General steps selected from the app's configured guidance for this type of incident.",
          source: "verified_guidance",
          items: priority.map((a) => a.title),
        },
        {
          title: "Why these come first",
          detail:
            incident.amount > 0
              ? "Money appears to have left your account, so steps that involve your bank and the official helpline are placed first."
              : "No monetary loss was reported, so securing accounts and preserving evidence are placed first.",
          source: "mock_analysis",
        },
        {
          title: "Human action required",
          detail: "Only you can contact your bank, call a helpline or file a complaint. STOPLOSS AI has not contacted anyone.",
          source: "verified_guidance",
        },
      ]
    }
    case "evidence": {
      const gaps: string[] = []
      if (!incident.transactionRef) gaps.push("Transaction reference (UTR/RRN) not yet provided")
      if (!evidence.some((e) => e.kind === "image")) gaps.push("No screenshots added yet")
      if (!evidence.some((e) => e.kind === "pdf")) gaps.push("No bank statement or PDF document added (optional)")
      return [
        {
          title: "Evidence inventory",
          detail:
            evidence.length > 0
              ? `${evidence.length} item(s) recorded for this case. File contents were not analysed.`
              : "No evidence has been added to this case yet.",
          source: "user_supplied",
          items: evidence.map((e) => e.name),
        },
        {
          title: gaps.length > 0 ? "Documentation gaps" : "No documentation gaps detected",
          detail:
            gaps.length > 0
              ? "These are based only on what has been recorded, not on reading your files."
              : "A transaction reference and at least one screenshot are on record.",
          source: "mock_analysis",
          items: gaps,
        },
        {
          title: "Evidence package checklist",
          detail: "Commonly useful items when preparing a report.",
          source: "verified_guidance",
          items: [
            "Payment confirmation or bank SMS",
            "Screenshots of the conversation or call log",
            "The other party's phone number, UPI ID, profile or link",
            "A short written timeline of events",
          ],
        },
      ]
    }
    case "recovery": {
      const done = actions.filter((a) => a.status === "completed").length
      const present = [
        `Category: ${category.label}`,
        `Approximate amount: ${amount}`,
        `Date and time: ${formatDateTime(incident.occurredAt)}`,
        `Payment method: ${incident.paymentMethod}`,
        incident.transactionRef ? `Transaction reference: ${incident.transactionRef}` : "Transaction reference: not provided",
      ]
      return [
        {
          title: "Complaint preparation checklist",
          detail: "What official complaint forms commonly ask for. Check the actual form for its exact requirements.",
          source: "verified_guidance",
          items: [
            "Your contact details",
            "Date, time and amount of each transaction",
            "Transaction references and the receiving account or UPI ID",
            "How the fraud happened, in your own words",
            "Evidence files",
          ],
        },
        {
          title: "Required information summary",
          detail: "Pulled from what you entered for this case.",
          source: "user_supplied",
          items: present,
        },
        {
          title: "Official reporting links",
          detail: "From the app's central resource list. These links have not yet been verified by the STOPLOSS AI team.",
          source: "verified_guidance",
          items: ["ncrp", "helpline-1930", "bank-official"]
            .map((id) => getOfficialResource(id)?.name)
            .filter((n): n is string => Boolean(n)),
        },
        {
          title: "Progress tracking",
          detail: `${done} of ${actions.length} response steps marked complete by you. STOPLOSS AI has not filed any complaint.`,
          source: "mock_analysis",
        },
      ]
    }
  }
}

/** Final state each agent settles into after a simulated run. */
export function settleAgentStatus(agentId: AgentId, ctx: AnalysisContext): Pick<AgentRunState, "status" | "currentTask"> {
  if (agentId === "evidence") {
    const awaiting = !ctx.incident.transactionRef || ctx.evidence.length === 0
    return awaiting
      ? { status: "awaiting_information", currentTask: "Waiting for a transaction reference or evidence file" }
      : { status: "completed", currentTask: "Evidence inventory up to date" }
  }
  if (agentId === "incident" && ctx.incident.description.trim().length < 60) {
    return { status: "needs_review", currentTask: "Summary drafted from a short description — please review" }
  }
  const done: Record<AgentId, string> = {
    incident: "Incident summary prepared",
    containment: "Priority checklist prepared",
    evidence: "Evidence inventory up to date",
    recovery: "Complaint checklist prepared",
  }
  return { status: "completed", currentTask: done[agentId] }
}

export const RUNNING_TASKS: Record<AgentId, string> = {
  incident: "Reconstructing the incident from your report",
  containment: "Organising immediate next steps",
  evidence: "Building the evidence inventory",
  recovery: "Preparing the complaint checklist",
}

export function idleAgentState(): IncidentAgentState {
  const idle = (id: AgentId): AgentRunState => ({
    status: "not_started",
    currentTask: `Waiting to start: ${AGENTS[id].role.toLowerCase()}`,
  })
  return { incident: idle("incident"), containment: idle("containment"), evidence: idle("evidence"), recovery: idle("recovery") }
}
