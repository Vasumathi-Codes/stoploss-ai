"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { EvidenceGraph } from "@/lib/evidence/types"
import { evidenceGraphService } from "@/lib/services"
import { useAppStore } from "@/lib/store/app-store"

export type GraphState =
  | { status: "loading"; graph?: EvidenceGraph }
  | { status: "ready"; graph: EvidenceGraph }
  | { status: "error"; error: string; graph?: EvidenceGraph }

/**
 * Loads a case's evidence graph and reloads it when the case or its evidence changes.
 * Every response carries a sequence number; a slower, older response never overwrites a newer
 * graph (from a later load or a mutation).
 */
export function useEvidenceGraph(incidentId: string) {
  const [state, setState] = useState<GraphState>({ status: "loading" })
  const seq = useRef(0)

  // Reload when the case is edited or evidence is added or removed elsewhere on the page.
  const version = useAppStore((s) => {
    const incident = s.incidents.find((i) => i.id === incidentId)
    const evidence = s.evidence
      .filter((e) => e.incidentId === incidentId)
      .map((e) => e.id)
      .sort()
      .join(",")
    return `${incident?.updatedAt ?? ""}|${incident?.transactionRef ?? ""}|${incident?.counterparty ?? ""}|${evidence}`
  })

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState((s) => ({ status: "loading", graph: s.graph }))
    try {
      const graph = await evidenceGraphService.get(incidentId)
      if (mine === seq.current) setState({ status: "ready", graph })
    } catch (error) {
      if (mine === seq.current) setState((s) => ({ status: "error", error: (error as Error).message, graph: s.graph }))
    }
  }, [incidentId])

  useEffect(() => {
    // Loading is an external sync keyed on the case's data version.
    void load()
  }, [load, version])

  /** Applies a graph returned by a mutation, superseding any load still in flight. */
  const apply = useCallback((graph: EvidenceGraph | undefined) => {
    if (!graph) return
    seq.current++
    setState({ status: "ready", graph })
  }, [])

  return { state, reload: load, apply }
}
