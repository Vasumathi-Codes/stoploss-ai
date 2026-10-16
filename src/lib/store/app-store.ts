"use client"

import { create } from "zustand"

import type { AppSnapshot } from "@/lib/services/types"

/** Browser-only file data, keyed by evidence id. Never sent to the server. */
export interface LocalFileData {
  objectUrl?: string
  textPreview?: string
}

/**
 * Client cache of the server snapshot (PostgreSQL is the source of truth).
 * Intentionally NOT persisted: incident details and evidence never touch
 * localStorage. Local file previews live only in this tab.
 *
 * Components read through the hooks in `src/features/*` and write through
 * `src/lib/services`, never by calling `setState` directly.
 */
export interface AppState extends AppSnapshot {
  status: "loading" | "ready" | "error"
  error?: string
  localFiles: Record<string, LocalFileData>
}

const EMPTY: AppSnapshot = {
  profile: { displayName: "", email: "", preferredLanguage: "English", city: "", phoneHint: "" },
  incidents: [],
  evidence: [],
  actions: [],
  findings: [],
  timeline: [],
  agentStates: {},
  resources: [],
  readEventIds: [],
  runningIncidentIds: [],
  analysis: { engine: "mock" },
  incidentEngines: {},
}

export const useAppStore = create<AppState>()(() => ({ ...EMPTY, status: "loading", localFiles: {} }))

/** Replaces server data, re-attaching this tab's local file previews. */
export function applySnapshot(snapshot: AppSnapshot) {
  useAppStore.setState((s) => ({
    ...snapshot,
    evidence: snapshot.evidence.map((e) => ({ ...e, ...s.localFiles[e.id] })),
    status: "ready",
    error: undefined,
  }))
}
