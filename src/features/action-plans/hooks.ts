"use client"

import { useMemo } from "react"

import { PRIORITIES } from "@/lib/config/taxonomy"
import { nextStep, openPriority, orderPlan } from "@/lib/plan"
import { useAppStore } from "@/lib/store/app-store"
import type { ActionItem } from "@/types"

/** Sort: open work by priority first, completed last. */
export function sortActions(list: ActionItem[]) {
  return [...list].sort((a, b) => {
    const ra = a.status === "completed" ? PRIORITIES.completed.rank : PRIORITIES[a.priority].rank
    const rb = b.status === "completed" ? PRIORITIES.completed.rank : PRIORITIES[b.priority].rank
    return ra - rb
  })
}

export function useActions(incidentId?: string) {
  const actions = useAppStore((s) => s.actions)
  return useMemo(
    () => sortActions(incidentId ? actions.filter((a) => a.incidentId === incidentId) : actions),
    [actions, incidentId],
  )
}

export function useAction(id: string | undefined) {
  return useAppStore((s) => s.actions.find((a) => a.id === id))
}

/** A case's plan in suggested order, its next step and open-priority counts. */
export function usePlan(incidentId: string | undefined) {
  const actions = useAppStore((s) => s.actions)
  return useMemo(() => {
    const mine = incidentId ? actions.filter((a) => a.incidentId === incidentId) : []
    return { ordered: orderPlan(mine), next: nextStep(mine), priority: openPriority(mine) }
  }, [actions, incidentId])
}

/** Plan summaries for every case, keyed by incident id. */
export function usePlansByIncident() {
  const actions = useAppStore((s) => s.actions)
  return useMemo(() => {
    const grouped = new Map<string, ActionItem[]>()
    for (const a of actions) grouped.set(a.incidentId, [...(grouped.get(a.incidentId) ?? []), a])
    const result = new Map<string, { next?: ActionItem; priority: ReturnType<typeof openPriority> }>()
    grouped.forEach((list, id) => result.set(id, { next: nextStep(list), priority: openPriority(list) }))
    return result
  }, [actions])
}
