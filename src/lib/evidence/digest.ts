/**
 * A value-free summary of the evidence graph for the agents.
 *
 * Agents never receive identifier values (references, UPI IDs, phone numbers, accounts) —
 * the same rule as for the case's transaction reference. They get fact types, which sources
 * agree, which conflict, and what is missing, so they can explain the picture without seeing
 * or repeating anything sensitive.
 */
import { FACT_TYPE_LABELS, SOURCE_TYPE_LABELS, TRANSACTION_STATUS_LABELS } from "./labels"
import type { EvidenceGraph, FactNode, FactType, ProcessingStatus, SourceType, TransactionStatus } from "./types"

export interface EvidenceDigest {
  /** Where every value below comes from. */
  provenance: string
  sources: { sourceType: SourceType | "unknown"; processing: ProcessingStatus; factTypes: FactType[] }[]
  transactions: {
    label: string
    status: TransactionStatus
    independentSources: number
    sourceTypes: SourceType[]
    agreeingFactTypes: FactType[]
    openConflictFactTypes: FactType[]
    linkedChatMentions: number
  }[]
  /** Facts the person checked: user review is the only thing that makes a fact "confirmed". */
  personReviewed: { confirmed: number; corrected: number; rejected: number; unreviewed: number }
  missing: string[]
}

const DIGEST_PROVENANCE =
  "Facts were extracted by STOPLOSS AI's screenshot reader (an AI vision model, unverified) and fixed-rule statement and chat parsers, with the person's consent. Agreements and conflicts were computed by fixed matching rules, not by AI. Identifier values are withheld."

export function digestGraph(graph: EvidenceGraph): EvidenceDigest | undefined {
  const facts = graph.nodes.filter((n): n is FactNode => n.type === "fact")
  const evidenceFacts = facts.filter((f) => f.sourceType !== "case_details")
  if (evidenceFacts.length === 0 && graph.processingStatus.processed === 0) return undefined
  const factById = new Map(facts.map((f) => [f.id, f]))

  const sources = graph.nodes.flatMap((n) =>
    n.type === "evidence" && n.evidenceId
      ? [
          {
            sourceType: n.sourceType ?? ("unknown" as const),
            processing: n.processingStatus,
            factTypes: [...new Set(facts.filter((f) => f.evidenceNodeId === n.id).map((f) => f.factType))],
          },
        ]
      : [],
  )

  const transactions = graph.nodes.flatMap((n) => {
    if (n.type !== "transaction") return []
    const own = facts.filter((f) => f.transactionId === n.transactionId && f.recordRole === "transaction")
    const ownIds = new Set(own.map((f) => f.id))
    const agreeing = new Set<FactType>()
    const conflicts = new Set<FactType>()
    let chat = 0
    for (const e of graph.edges) {
      const a = factById.get(e.source)
      const b = factById.get(e.target)
      if (e.relation === "related_context" && e.target === n.id) chat++
      if (!a || !b || !ownIds.has(a.id) || !ownIds.has(b.id)) continue
      if (
        e.relation === "corroborates" &&
        e.outcome === "match" &&
        a.sourceType !== "case_details" &&
        b.sourceType !== "case_details"
      )
        agreeing.add(a.factType)
      if (e.relation === "conflicts_with" && e.reviewStatus !== "reviewed") conflicts.add(a.factType)
    }
    return [
      {
        label: n.label.replace(/ · ref .*$/, ""),
        status: n.status,
        independentSources: n.sourceCount,
        sourceTypes: [...new Set(own.map((f) => f.sourceType))],
        agreeingFactTypes: [...agreeing],
        openConflictFactTypes: [...conflicts],
        linkedChatMentions: chat,
      },
    ]
  })

  return {
    provenance: DIGEST_PROVENANCE,
    sources,
    transactions,
    personReviewed: {
      confirmed: evidenceFacts.filter((f) => f.reviewStatus === "user_confirmed").length,
      corrected: evidenceFacts.filter((f) => f.reviewStatus === "user_corrected").length,
      rejected: evidenceFacts.filter((f) => f.reviewStatus === "user_rejected").length,
      unreviewed: evidenceFacts.filter((f) => f.reviewStatus === "unreviewed").length,
    },
    // Titles only, without identifier values or file names (names can contain personal details).
    missing: graph.missingEvidence.map((m) =>
      m.id.startsWith("unprocessed:")
        ? "An evidence file hasn't been analysed yet"
        : m.id.startsWith("failed:")
          ? "Analysing an evidence file failed"
          : m.id.startsWith("unsupported:")
            ? "An evidence file can't be analysed (unsupported type)"
            : m.title.replace(/ · ref .*$/, ""),
    ),
  }
}

const types = (list: FactType[]) => list.map((t) => FACT_TYPE_LABELS[t].toLowerCase()).join(", ")

/** Plain-language lines for the Evidence Agent's deterministic "Cross-source checks" finding. */
export function digestItems(d: EvidenceDigest): string[] {
  const items: string[] = []
  for (const t of d.transactions) {
    const status = TRANSACTION_STATUS_LABELS[t.status].label
    const agree = t.agreeingFactTypes.length > 0 ? ` — sources agree on ${types(t.agreeingFactTypes)}` : ""
    const conflict = t.openConflictFactTypes.length > 0 ? ` — conflict on ${types(t.openConflictFactTypes)}` : ""
    items.push(
      `${t.label}: ${status} (${t.independentSources} source${t.independentSources === 1 ? "" : "s"})${agree}${conflict}`,
    )
  }
  const processed = d.sources.filter((s) => s.processing === "processed" || s.processing === "no_facts")
  if (processed.length > 0) {
    const kinds = [
      ...new Set(processed.map((s) => (s.sourceType === "unknown" ? "file" : SOURCE_TYPE_LABELS[s.sourceType].toLowerCase()))),
    ]
    items.push(`Analysed: ${kinds.join(", ")}`)
  }
  for (const m of d.missing.slice(0, 3)) items.push(m)
  return items.slice(0, 8)
}
