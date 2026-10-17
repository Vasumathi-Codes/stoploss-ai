"use client"

import { toast } from "sonner"

import { prepareScreenshot } from "@/lib/images/prepare-screenshot"
import { getActionTemplates } from "@/lib/playbooks"
import { applySnapshot, type LocalFileData, useAppStore } from "@/lib/store/app-store"
import type { EvidenceMeta } from "@/lib/validation/api"
import type { ScreenshotReading } from "@/types"

import type {
  ActionPlanService,
  AgentService,
  AppSnapshot,
  CaseService,
  DemoService,
  EvidenceService,
  ExtractionService,
  IncidentService,
  LocalEvidenceFile,
  ProfileService,
} from "../types"

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    })
  } catch {
    throw new ApiError(0, "Can't reach the STOPLOSS AI server. Check your connection and try again.")
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
  return data as T
}

/** Runs a mutation, applies the returned snapshot and reports failures. */
async function mutate(method: string, path: string, body?: unknown): Promise<boolean> {
  try {
    const { snapshot } = await request<{ snapshot: AppSnapshot }>(method, path, body)
    applySnapshot(snapshot)
    ensurePolling()
    return true
  } catch (error) {
    toast.error("That change wasn't saved", { description: (error as Error).message })
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Loading & polling                                                   */
/* ------------------------------------------------------------------ */

const POLL_MS = 800
let pollTimer: ReturnType<typeof setTimeout> | undefined

async function refresh() {
  try {
    applySnapshot(await request<AppSnapshot>("GET", "/state"))
  } catch (error) {
    // Keep showing the last good data if we have it.
    if (useAppStore.getState().status !== "ready") {
      useAppStore.setState({ status: "error", error: (error as Error).message })
    }
    throw error
  }
}

/** Polls while any analysis runs on the server, then stops. */
function ensurePolling() {
  if (pollTimer || useAppStore.getState().runningIncidentIds.length === 0) return
  const tick = async () => {
    await refresh().catch(() => undefined)
    pollTimer = useAppStore.getState().runningIncidentIds.length > 0 ? setTimeout(tick, POLL_MS) : undefined
  }
  pollTimer = setTimeout(tick, POLL_MS)
}

/* ------------------------------------------------------------------ */
/* Local file handling                                                 */
/* ------------------------------------------------------------------ */

const toMeta = (files: LocalEvidenceFile[]): EvidenceMeta[] =>
  files.map(({ file }) => ({
    name: file.name,
    mimeType: file.type as EvidenceMeta["mimeType"],
    size: file.size,
  }))

/** Keeps previews in this tab, keyed by the ids the server assigned. */
function rememberLocalFiles(ids: string[], files: LocalEvidenceFile[]) {
  const entries: Record<string, LocalFileData> = {}
  ids.forEach((id, i) => {
    const { objectUrl, textPreview } = files[i] ?? {}
    if (objectUrl || textPreview) entries[id] = { objectUrl, textPreview }
  })
  useAppStore.setState((s) => ({ localFiles: { ...s.localFiles, ...entries } }))
}

function releaseLocalFiles(keep?: Set<string>) {
  const { localFiles } = useAppStore.getState()
  const next: Record<string, LocalFileData> = {}
  for (const [id, data] of Object.entries(localFiles)) {
    if (keep?.has(id)) next[id] = data
    else if (data.objectUrl) URL.revokeObjectURL(data.objectUrl)
  }
  useAppStore.setState({ localFiles: next })
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

const runTokens = new Map<string, symbol>()

export const agentService: AgentService = {
  isRunning: (incidentId) => useAppStore.getState().runningIncidentIds.includes(incidentId),

  async runAnalysis(incidentId) {
    const token = Symbol(incidentId)
    runTokens.set(incidentId, token)
    if (!(await mutate("POST", `/incidents/${incidentId}/analysis`))) return false
    // Resolve once the server reports the run has finished.
    return new Promise<boolean>((resolve) => {
      const check = (s: ReturnType<typeof useAppStore.getState>) => {
        if (runTokens.get(incidentId) !== token) {
          unsubscribe()
          resolve(false)
        } else if (!s.runningIncidentIds.includes(incidentId)) {
          unsubscribe()
          runTokens.delete(incidentId)
          resolve(s.incidents.some((i) => i.id === incidentId && i.status !== "analysis_in_progress"))
        }
      }
      const unsubscribe = useAppStore.subscribe(check)
      check(useAppStore.getState())
    })
  },
}

export const incidentService: IncidentService = {
  async createIncident(input, files) {
    const { incidentId, evidenceIds, snapshot } = await request<{
      incidentId: string
      evidenceIds: string[]
      snapshot: AppSnapshot
    }>("POST", "/incidents", {
      ...input,
      transactionRef: input.transactionRef || undefined,
      counterparty: input.counterparty || undefined,
      evidence: toMeta(files),
    })
    rememberLocalFiles(evidenceIds, files)
    applySnapshot(snapshot)
    const incident = snapshot.incidents.find((i) => i.id === incidentId)
    if (!incident) throw new ApiError(500, "The case was created but couldn't be loaded")
    void agentService.runAnalysis(incidentId)
    return incident
  },
}

export const caseService: CaseService = {
  updateStatus: (incidentId, status) => mutate("PATCH", `/incidents/${incidentId}`, { status }),
  addNote: (incidentId, body) => mutate("POST", `/incidents/${incidentId}/notes`, { body }),
  removeNote: (incidentId, noteId) => mutate("DELETE", `/incidents/${incidentId}/notes/${noteId}`),
  setTransactionRef: (incidentId, ref) => mutate("PATCH", `/incidents/${incidentId}`, { transactionRef: ref }),
  updateDetails: (incidentId, patch) => mutate("PATCH", `/incidents/${incidentId}`, patch),
}

export const evidenceService: EvidenceService = {
  async addFiles(incidentId, files) {
    if (files.length === 0) return true
    try {
      const { evidenceIds, snapshot } = await request<{ evidenceIds: string[]; snapshot: AppSnapshot }>(
        "POST",
        `/incidents/${incidentId}/evidence`,
        { files: toMeta(files) },
      )
      rememberLocalFiles(evidenceIds, files)
      applySnapshot(snapshot)
      return true
    } catch (error) {
      files.forEach((f) => f.objectUrl && URL.revokeObjectURL(f.objectUrl))
      toast.error("Evidence wasn't added", { description: (error as Error).message })
      return false
    }
  },

  async remove(evidenceId) {
    const ok = await mutate("DELETE", `/evidence/${evidenceId}`)
    if (ok) releaseLocalFiles(new Set(useAppStore.getState().evidence.map((e) => e.id)))
    return ok
  },
}

export const actionPlanService: ActionPlanService = {
  setStatus: (actionId, status) => mutate("PATCH", `/actions/${actionId}`, { status }),
  suggestFirstAction: (incident) => getActionTemplates(incident)[0],
}

export const extractionService: ExtractionService = {
  async readScreenshot(file) {
    const image = await prepareScreenshot(file)
    const { result } = await request<{ result: ScreenshotReading }>("POST", "/extract", image)
    return result
  },
}

export const profileService: ProfileService = {
  updateProfile: (patch) => mutate("PATCH", "/profile", patch),
}

export const demoService: DemoService = {
  async refresh() {
    await refresh()
    ensurePolling()
  },

  async resetDemoData() {
    runTokens.clear()
    const ok = await mutate("POST", "/demo/reset")
    if (ok) releaseLocalFiles()
    return ok
  },

  markEventsRead: (ids) => mutate("POST", "/notifications/read", { ids }),
}
