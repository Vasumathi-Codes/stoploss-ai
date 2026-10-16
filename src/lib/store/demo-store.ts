"use client"

import { create } from "zustand"

import { createSeedState } from "@/lib/mock-data/seed"
import type {
  ActionItem,
  AgentFinding,
  CaseTimelineEvent,
  EvidenceItem,
  Incident,
  IncidentAgentState,
  UserProfile,
} from "@/types"

/**
 * In-memory demo state. Intentionally NOT persisted: incident descriptions and
 * evidence never touch localStorage, and a page refresh restores the seed data.
 *
 * Components should read through the hooks in `src/features/*` and write through
 * `src/lib/services`, never by calling `setState` directly.
 */
export interface DemoState {
  incidents: Incident[]
  evidence: EvidenceItem[]
  actions: ActionItem[]
  findings: AgentFinding[]
  timeline: CaseTimelineEvent[]
  agentStates: Record<string, IncidentAgentState>
  profile: UserProfile
  /** Timeline event ids the user has dismissed from the notification menu. */
  readEventIds: string[]
}

export const useDemoStore = create<DemoState>()(() => createSeedState())
