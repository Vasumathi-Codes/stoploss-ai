"use client"

import { useMemo } from "react"

import { useDemoStore } from "@/lib/store/demo-store"
import type { AgentId } from "@/types"

export function useAgentState(incidentId: string | undefined) {
  return useDemoStore((s) => (incidentId ? s.agentStates[incidentId] : undefined))
}

export function useFindings(incidentId: string | undefined, agentId?: AgentId) {
  const findings = useDemoStore((s) => s.findings)
  return useMemo(
    () => findings.filter((f) => f.incidentId === incidentId && (!agentId || f.agentId === agentId)),
    [findings, incidentId, agentId],
  )
}

/** Newest first. Pass an incidentId to scope to one case. */
export function useTimeline(incidentId?: string, limit?: number) {
  const timeline = useDemoStore((s) => s.timeline)
  return useMemo(() => {
    const list = incidentId ? timeline.filter((e) => e.incidentId === incidentId) : timeline
    return limit ? list.slice(0, limit) : list
  }, [timeline, incidentId, limit])
}
