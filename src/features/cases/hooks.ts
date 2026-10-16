"use client"

import { useMemo } from "react"

import { ACTIVE_STATUSES } from "@/lib/config/taxonomy"
import { useAppStore } from "@/lib/store/app-store"
import type { ActionItem } from "@/types"

export function useIncidents() {
  return useAppStore((s) => s.incidents)
}

export function useIncident(id: string | undefined) {
  return useAppStore((s) => (id ? s.incidents.find((i) => i.id === id) : undefined))
}

export function useActiveIncidents() {
  const incidents = useIncidents()
  return useMemo(
    () => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [incidents],
  )
}

export function computeProgress(actions: ActionItem[]) {
  const total = actions.length
  const done = actions.filter((a) => a.status === "completed").length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Map of incidentId → progress, computed once per actions change. */
export function useProgressByIncident() {
  const actions = useAppStore((s) => s.actions)
  return useMemo(() => {
    const grouped = new Map<string, ActionItem[]>()
    for (const a of actions) grouped.set(a.incidentId, [...(grouped.get(a.incidentId) ?? []), a])
    const result = new Map<string, ReturnType<typeof computeProgress>>()
    grouped.forEach((list, id) => result.set(id, computeProgress(list)))
    return result
  }, [actions])
}

export function useProfile() {
  return useAppStore((s) => s.profile)
}
