"use client"

import { useMemo } from "react"

import { useDemoStore } from "@/lib/store/demo-store"

export function useEvidence(incidentId?: string) {
  const evidence = useDemoStore((s) => s.evidence)
  return useMemo(
    () =>
      (incidentId ? evidence.filter((e) => e.incidentId === incidentId) : evidence)
        .slice()
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [evidence, incidentId],
  )
}
