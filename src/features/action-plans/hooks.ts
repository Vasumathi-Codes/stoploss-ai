"use client"

import { useMemo } from "react"

import { PRIORITIES } from "@/lib/config/taxonomy"
import { useDemoStore } from "@/lib/store/demo-store"
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
  const actions = useDemoStore((s) => s.actions)
  return useMemo(
    () => sortActions(incidentId ? actions.filter((a) => a.incidentId === incidentId) : actions),
    [actions, incidentId],
  )
}

export function useAction(id: string | undefined) {
  return useDemoStore((s) => s.actions.find((a) => a.id === id))
}
