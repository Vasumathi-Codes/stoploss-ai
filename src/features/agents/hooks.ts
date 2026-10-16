"use client"

import { useMemo } from "react"

import { useAppStore } from "@/lib/store/app-store"
import { ANALYSIS_COPY } from "@/lib/config/analysis-copy"
import type { AgentId, AnalysisEngine } from "@/types"

/**
 * The engine behind an incident's analysis: its latest run's engine, or for a case
 * that hasn't been analysed yet, the engine a new run would use. Pass no id for
 * the configured engine. Returns the engine and the matching UI copy.
 */
export function useAnalysisEngine(incidentId?: string) {
  const engine = useAppStore((s): AnalysisEngine => (incidentId && s.incidentEngines[incidentId]) || s.analysis.engine)
  const model = useAppStore((s) => s.analysis.model)
  return { engine, model, copy: ANALYSIS_COPY[engine] }
}

export function useAgentState(incidentId: string | undefined) {
  return useAppStore((s) => (incidentId ? s.agentStates[incidentId] : undefined))
}

export function useFindings(incidentId: string | undefined, agentId?: AgentId) {
  const findings = useAppStore((s) => s.findings)
  return useMemo(
    () => findings.filter((f) => f.incidentId === incidentId && (!agentId || f.agentId === agentId)),
    [findings, incidentId, agentId],
  )
}

/** Newest first. Pass an incidentId to scope to one case. */
export function useTimeline(incidentId?: string, limit?: number) {
  const timeline = useAppStore((s) => s.timeline)
  return useMemo(() => {
    const list = incidentId ? timeline.filter((e) => e.incidentId === incidentId) : timeline
    return limit ? list.slice(0, limit) : list
  }, [timeline, incidentId, limit])
}
