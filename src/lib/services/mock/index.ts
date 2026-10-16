"use client"

import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { OFFICIAL_RESOURCES } from "@/lib/config/official-resources"
import { CASE_STATUSES } from "@/lib/config/taxonomy"
import { createSeedState } from "@/lib/mock-data/seed"
import { type DemoState, useDemoStore } from "@/lib/store/demo-store"
import { createCaseReference, createId } from "@/lib/utils/ids"
import type { ActionItem, AgentId, CaseStatus, CaseTimelineEvent, EvidenceItem, EvidenceKind, Incident } from "@/types"

import type {
  ActionPlanService,
  AgentService,
  CaseService,
  DemoService,
  EvidenceService,
  IncidentService,
  LocalEvidenceFile,
  ProfileService,
  ResourceService,
} from "../types"
import {
  buildActionItems,
  buildFindings,
  getActionTemplates,
  idleAgentState,
  RUNNING_TASKS,
  settleAgentStatus,
} from "./playbooks"

/** Delay between simulated agent steps. Deterministic, purely for readability. */
const STEP_MS = 1400

const set = useDemoStore.setState
const get = useDemoStore.getState
const now = () => new Date().toISOString()

function event(incidentId: string, e: Omit<CaseTimelineEvent, "id" | "incidentId" | "at">): CaseTimelineEvent {
  return { id: createId("evt"), incidentId, at: now(), ...e }
}

function pushEvents(state: DemoState, events: CaseTimelineEvent[]): Pick<DemoState, "timeline"> {
  return { timeline: [...events.reverse(), ...state.timeline] }
}

function patchIncident(state: DemoState, id: string, patch: Partial<Incident>): Pick<DemoState, "incidents"> {
  return {
    incidents: state.incidents.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)),
  }
}

function contextFor(state: DemoState, incidentId: string) {
  const incident = state.incidents.find((i) => i.id === incidentId)
  if (!incident) return undefined
  return {
    incident,
    evidence: state.evidence.filter((e) => e.incidentId === incidentId),
    actions: state.actions.filter((a) => a.incidentId === incidentId),
  }
}

/** Recompute one agent's findings after the user changes underlying data. */
function refreshAgent(incidentId: string, agentId: AgentId) {
  const state = get()
  const agents = state.agentStates[incidentId]
  const current = agents?.[agentId]
  // Only agents that have already produced output are refreshed.
  if (!agents || !current || current.status === "not_started" || current.status === "analyzing") return
  const ctx = contextFor(state, incidentId)
  if (!ctx) return

  const settled = settleAgentStatus(agentId, ctx)
  const at = now()
  const findings = buildFindings(agentId, ctx).map((f) => ({
    ...f,
    id: createId("fnd"),
    incidentId,
    agentId,
    createdAt: at,
  }))
  const events: CaseTimelineEvent[] = []
  let statusPatch: Partial<Incident> | undefined

  if (agentId === "evidence" && current.status !== settled.status) {
    if (settled.status === "completed") {
      events.push(
        event(incidentId, { actor: "agent", agentId, title: "Evidence Agent: required information received", tone: "success" }),
      )
      if (ctx.incident.status === "user_action_required") statusPatch = { status: "action_plan_ready" }
    } else if (settled.status === "awaiting_information") {
      events.push(
        event(incidentId, {
          actor: "agent",
          agentId,
          title: "Evidence Agent: information needed",
          detail: settled.currentTask,
          tone: "warning",
        }),
      )
      if (ctx.incident.status === "action_plan_ready") statusPatch = { status: "user_action_required" }
    }
  }

  set((s) => ({
    findings: [...s.findings.filter((f) => !(f.incidentId === incidentId && f.agentId === agentId)), ...findings],
    agentStates: {
      ...s.agentStates,
      [incidentId]: { ...s.agentStates[incidentId], [agentId]: { ...current, ...settled, completedAt: at } },
    },
    ...(events.length ? pushEvents(s, events) : {}),
    ...(statusPatch ? patchIncident(s, incidentId, statusPatch) : {}),
  }))
}

/* ------------------------------------------------------------------ */
/* Agent orchestration (deterministic simulation)                      */
/* ------------------------------------------------------------------ */

const runs = new Map<string, symbol>()
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const PRESERVED_STATUSES: CaseStatus[] = ["reporting_in_progress", "resolved", "archived"]

export const agentService: AgentService = {
  isRunning: (incidentId) => runs.has(incidentId),

  cancelAll() {
    runs.clear()
  },

  async runAnalysis(incidentId) {
    const start = contextFor(get(), incidentId)
    if (!start) return false
    const token = Symbol(incidentId)
    runs.set(incidentId, token)
    const previousStatus = start.incident.status
    const alive = () => runs.get(incidentId) === token

    // Reset this incident's agent output; keep the user's task progress.
    const existingKeys = new Set(start.actions.map((a) => a.key))
    const missingActions = getActionTemplates(start.incident).filter((t) => !existingKeys.has(t.key)).length
    set((s) => ({
      findings: s.findings.filter((f) => f.incidentId !== incidentId),
      agentStates: { ...s.agentStates, [incidentId]: idleAgentState() },
      ...patchIncident(s, incidentId, { status: "analysis_in_progress" }),
      ...pushEvents(s, [
        event(incidentId, {
          actor: "system",
          title: "Simulated analysis started",
          detail: "Demo workflow — no AI model is called",
          tone: "info",
        }),
      ]),
    }))

    for (const agentId of AGENT_ORDER) {
      if (!alive()) return false
      set((s) => ({
        agentStates: {
          ...s.agentStates,
          [incidentId]: {
            ...s.agentStates[incidentId],
            [agentId]: { status: "analyzing", currentTask: RUNNING_TASKS[agentId], startedAt: now() },
          },
        },
      }))
      await sleep(STEP_MS)
      if (!alive()) return false

      // The Containment Agent is the one that produces the action plan.
      if (agentId === "containment" && missingActions > 0) {
        const ctx = contextFor(get(), incidentId)
        if (ctx) {
          const keys = new Set(ctx.actions.map((a) => a.key))
          const fresh = buildActionItems(ctx.incident, now(), () => createId("act")).filter((a) => !keys.has(a.key))
          set((s) => ({
            actions: [...s.actions, ...fresh],
            ...pushEvents(s, [
              event(incidentId, {
                actor: "agent",
                agentId,
                title: "Action plan generated",
                detail: `${fresh.length} suggested steps`,
                tone: "info",
              }),
            ]),
          }))
        }
      }

      const ctx = contextFor(get(), incidentId)
      if (!ctx) return false
      const at = now()
      const settled = settleAgentStatus(agentId, ctx)
      const findings = buildFindings(agentId, ctx).map((f) => ({ ...f, id: createId("fnd"), incidentId, agentId, createdAt: at }))
      const events = [
        event(incidentId, {
          actor: "agent",
          agentId,
          title: `${AGENTS[agentId].name}: ${settled.currentTask}`,
          tone: settled.status === "completed" ? "success" : "warning",
        }),
      ]
      if (agentId === "evidence" && !ctx.incident.transactionRef) {
        events.push(
          event(incidentId, { actor: "agent", agentId, title: "Missing transaction reference identified", tone: "warning" }),
        )
      }
      set((s) => ({
        findings: [...s.findings, ...findings],
        agentStates: {
          ...s.agentStates,
          [incidentId]: {
            ...s.agentStates[incidentId],
            [agentId]: { ...settled, startedAt: s.agentStates[incidentId]?.[agentId]?.startedAt, completedAt: at },
          },
        },
        ...pushEvents(s, events),
      }))
    }

    if (!alive()) return false
    runs.delete(incidentId)
    const evidenceState = get().agentStates[incidentId]?.evidence.status
    const nextStatus: CaseStatus = PRESERVED_STATUSES.includes(previousStatus)
      ? previousStatus
      : evidenceState === "awaiting_information"
        ? "user_action_required"
        : "action_plan_ready"
    set((s) => ({
      ...patchIncident(s, incidentId, { status: nextStatus }),
      ...pushEvents(s, [
        event(incidentId, {
          actor: "system",
          title: "Case ready for your review",
          detail: CASE_STATUSES[nextStatus].label,
          tone: "success",
        }),
      ]),
    }))
    return true
  },
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

function kindFor(mime: string): EvidenceKind {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/plain") return "text"
  return "other"
}

function toEvidence(incidentId: string, files: LocalEvidenceFile[]): EvidenceItem[] {
  const at = now()
  return files.map(({ file, objectUrl, textPreview }) => ({
    id: createId("ev"),
    incidentId,
    name: file.name,
    kind: kindFor(file.type),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    addedAt: at,
    objectUrl,
    textPreview,
    isSample: false,
  }))
}

export const evidenceService: EvidenceService = {
  addFiles(incidentId, files) {
    if (files.length === 0) return
    const items = toEvidence(incidentId, files)
    set((s) => ({
      evidence: [...s.evidence, ...items],
      ...patchIncident(s, incidentId, {}),
      ...pushEvents(
        s,
        items.map((i) => event(incidentId, { actor: "user", title: "Evidence added", detail: i.name })),
      ),
    }))
    refreshAgent(incidentId, "evidence")
  },

  remove(evidenceId) {
    const item = get().evidence.find((e) => e.id === evidenceId)
    if (!item) return
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl)
    set((s) => ({
      evidence: s.evidence.filter((e) => e.id !== evidenceId),
      ...patchIncident(s, item.incidentId, {}),
      ...pushEvents(s, [event(item.incidentId, { actor: "user", title: "Evidence removed", detail: item.name })]),
    }))
    refreshAgent(item.incidentId, "evidence")
  },
}

/* ------------------------------------------------------------------ */
/* Incidents & cases                                                   */
/* ------------------------------------------------------------------ */

export const incidentService: IncidentService = {
  async createIncident(input, files) {
    const state = get()
    const at = now()
    const incident: Incident = {
      id: createId("inc"),
      reference: createCaseReference(new Set(state.incidents.map((i) => i.reference))),
      title: input.title,
      category: input.category,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      occurredAt: input.occurredAt,
      reportedAt: at,
      updatedAt: at,
      paymentMethod: input.paymentMethod,
      transactionRef: input.transactionRef || undefined,
      hasAccountAccess: input.hasAccountAccess,
      ongoing: input.ongoing,
      status: "reported",
      notes: [],
      isSample: false,
    }
    const evidence = toEvidence(incident.id, files)
    set((s) => ({
      incidents: [incident, ...s.incidents],
      evidence: [...s.evidence, ...evidence],
      agentStates: { ...s.agentStates, [incident.id]: idleAgentState() },
      ...pushEvents(s, [
        event(incident.id, { actor: "user", title: "Incident details provided", detail: incident.title, tone: "info" }),
        ...evidence.map((e) => event(incident.id, { actor: "user", title: "Evidence added", detail: e.name })),
      ]),
    }))
    void agentService.runAnalysis(incident.id)
    return incident
  },
}

export const caseService: CaseService = {
  updateStatus(incidentId, status) {
    set((s) => ({
      ...patchIncident(s, incidentId, { status }),
      ...pushEvents(s, [
        event(incidentId, {
          actor: "user",
          title: `Status changed to ${CASE_STATUSES[status].label}`,
          tone: status === "resolved" ? "success" : "neutral",
        }),
      ]),
    }))
  },

  addNote(incidentId, body) {
    const note = { id: createId("note"), body, createdAt: now() }
    set((s) => {
      const incident = s.incidents.find((i) => i.id === incidentId)
      if (!incident) return {}
      return {
        ...patchIncident(s, incidentId, { notes: [...incident.notes, note] }),
        ...pushEvents(s, [event(incidentId, { actor: "user", title: "Note added" })]),
      }
    })
  },

  removeNote(incidentId, noteId) {
    set((s) => {
      const incident = s.incidents.find((i) => i.id === incidentId)
      if (!incident) return {}
      return patchIncident(s, incidentId, { notes: incident.notes.filter((n) => n.id !== noteId) })
    })
  },

  setTransactionRef(incidentId, ref) {
    set((s) => ({
      ...patchIncident(s, incidentId, { transactionRef: ref }),
      ...pushEvents(s, [event(incidentId, { actor: "user", title: "Transaction reference added", tone: "info" })]),
    }))
    refreshAgent(incidentId, "incident")
    refreshAgent(incidentId, "evidence")
    refreshAgent(incidentId, "recovery")
  },
}

/* ------------------------------------------------------------------ */
/* Action plans                                                        */
/* ------------------------------------------------------------------ */

const STATUS_EVENT: Record<ActionItem["status"], { title: string; tone: CaseTimelineEvent["tone"] }> = {
  completed: { title: "Task marked complete", tone: "success" },
  in_progress: { title: "Task started", tone: "info" },
  pending: { title: "Task reopened", tone: "neutral" },
}

export const actionPlanService: ActionPlanService = {
  setStatus(actionId, status) {
    const action = get().actions.find((a) => a.id === actionId)
    if (!action || action.status === status) return
    const at = now()
    const incident = get().incidents.find((i) => i.id === action.incidentId)
    const startsReporting =
      action.key === "file-ncrp" &&
      status !== "pending" &&
      (incident?.status === "action_plan_ready" || incident?.status === "user_action_required")

    set((s) => ({
      actions: s.actions.map((a) =>
        a.id === actionId ? { ...a, status, updatedAt: at, completedAt: status === "completed" ? at : undefined } : a,
      ),
      ...patchIncident(s, action.incidentId, startsReporting ? { status: "reporting_in_progress" } : {}),
      ...pushEvents(s, [event(action.incidentId, { actor: "user", ...STATUS_EVENT[status], detail: action.title })]),
    }))
    refreshAgent(action.incidentId, "recovery")
  },

  suggestFirstAction(incident) {
    return getActionTemplates(incident)[0]
  },
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export const resourceService: ResourceService = {
  listOfficialResources: () => OFFICIAL_RESOURCES,
}

export const profileService: ProfileService = {
  updateProfile(patch) {
    set((s) => ({ profile: { ...s.profile, ...patch } }))
  },
}

export const demoService: DemoService = {
  resetDemoData() {
    agentService.cancelAll()
    get().evidence.forEach((e) => e.objectUrl && URL.revokeObjectURL(e.objectUrl))
    set(createSeedState(), true)
  },
  markEventsRead(ids) {
    set((s) => ({ readEventIds: Array.from(new Set([...s.readEventIds, ...ids])) }))
  },
}
