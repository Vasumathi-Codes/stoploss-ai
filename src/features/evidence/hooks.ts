"use client"

import { useMemo } from "react"

import { useAppStore } from "@/lib/store/app-store"

export function useEvidence(incidentId?: string) {
  const evidence = useAppStore((s) => s.evidence)
  return useMemo(
    () =>
      (incidentId ? evidence.filter((e) => e.incidentId === incidentId) : evidence)
        .slice()
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [evidence, incidentId],
  )
}
