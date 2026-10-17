/**
 * Test helpers for Evidence Intelligence. Every value is fictional (example_run/ material).
 * Not imported by application code.
 */
import { buildEvidenceGraph, type GraphEvidenceInput, type GraphFactInput, type GraphMatchInput, toEngineFact } from "./graph"
import { runMatching } from "./matching"
import type { StatementLine } from "./statement-parser"
import type { EngineFact, EvidenceGraph, ExtractedFact, FactReviewStatus } from "./types"
import type { ScreenshotReading } from "@/types"

export const READING_01: ScreenshotReading = {
  isPaymentRecord: true,
  kind: "bank_sms",
  direction: "debit",
  amount: 18500,
  currency: "INR",
  occurredAt: "2026-10-15T09:22:00.000Z",
  occurredAtPrecision: "minute",
  transactionRef: "528104779213",
  counterparty: "quickbuyer77@okdemo",
  paymentMethod: "UPI app",
  containsSensitiveData: false,
}

export const reading = (overrides: Partial<ScreenshotReading> = {}): ScreenshotReading => ({ ...READING_01, ...overrides })

/** Positioned lines laid out like example_run/documents/bank-statement-oct-2026.pdf. */
export function statementLines(
  rows: [date: string, desc: string, ref: string, debit: string, credit: string][],
  page = 1,
): StatementLine[] {
  const header: StatementLine = {
    page,
    line: 4,
    cells: [
      { text: "Date", x: 34, width: 20 },
      { text: "Description", x: 97, width: 50 },
      { text: "Reference", x: 295, width: 44 },
      { text: "Debit (₹)", x: 405, width: 36 },
      { text: "Credit (₹)", x: 457, width: 40 },
      { text: "Balance (₹)", x: 514, width: 45 },
    ],
  }
  return [
    header,
    ...rows.map(([date, desc, ref, debit, credit], i) => ({
      page,
      line: 5 + i,
      cells: [
        { text: date, x: 34, width: 47 },
        { text: desc, x: 97, width: 140 },
        { text: ref, x: 295, width: 60 },
        ...(debit ? [{ text: debit, x: 401, width: 40 }] : []),
        ...(credit ? [{ text: credit, x: 457, width: 40 }] : []),
        { text: "1,000.00", x: 522, width: 37 },
      ],
    })),
  ]
}

let counter = 0

/** Stored-fact rows for extracted facts, as the database would return them. */
export function asRows(
  facts: ExtractedFact[],
  evidenceId: string | null,
  status: FactReviewStatus = "unreviewed",
): GraphFactInput[] {
  return facts.map((f) => ({
    id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    evidenceId,
    transactionId: null,
    factKey: f.factKey,
    recordKey: f.recordKey,
    recordRole: f.recordRole,
    factType: f.factType,
    sourceType: f.sourceType,
    extractionMethod: f.extractionMethod,
    extractorVersion: f.extractorVersion ?? null,
    rawValue: f.rawValue,
    normalizedValue: f.normalizedValue,
    correctedValue: null,
    amountMinor: f.amountMinor ?? null,
    currency: f.currency ?? null,
    occurredAt: f.occurredAt ?? null,
    timePrecision: f.timePrecision ?? null,
    sourceLocation: f.sourceLocation ?? null,
    reviewStatus: status,
    updatedAt: "2026-10-17T10:00:00.000Z",
  }))
}

export const engineFacts = (rows: GraphFactInput[]): EngineFact[] => rows.map(toEngineFact)

export function evidenceRow(
  id: string,
  name: string,
  kind: GraphEvidenceInput["kind"],
  status: GraphEvidenceInput["processingStatus"] = "processed",
): GraphEvidenceInput {
  const mimeType = kind === "image" ? "image/png" : kind === "pdf" ? "application/pdf" : "text/plain"
  return {
    id,
    name,
    kind,
    mimeType,
    size: 1000,
    addedAt: `2026-10-16T10:00:0${id.slice(-1)}.000Z`,
    processingStatus: status,
    processingError: null,
  }
}

/**
 * What reconciliation would persist for these facts, then the graph built from it —
 * the same path as the server, without a database.
 */
export function graphFrom(
  evidence: GraphEvidenceInput[],
  rows: GraphFactInput[],
  reviews: Partial<Record<string, GraphMatchInput["reviewStatus"]>> = {},
): EvidenceGraph {
  const out = runMatching(engineFacts(rows))
  const candidates = out.candidates.map((c, i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    candidateKey: c.key,
  }))
  const idByKey = new Map(candidates.map((c) => [c.candidateKey, c.id]))
  const facts = rows.map((r) => ({ ...r, transactionId: idByKey.get(out.factCandidate.get(r.id) ?? "") ?? null }))
  const matches: GraphMatchInput[] = out.results.map((r, i) => ({
    id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ruleId: r.ruleId,
    outcome: r.outcome,
    relation: r.relation,
    factAId: r.factAId,
    factBId: r.factBId,
    transactionId: r.candidateKey ? (idByKey.get(r.candidateKey) ?? null) : null,
    explanation: r.explanation,
    uncertainty: r.uncertainty ?? null,
    requiresReview: r.requiresReview,
    reviewStatus: reviews[r.ruleId] ?? "open",
  }))
  return buildEvidenceGraph({ caseId: "case-1", generatedAt: "2026-10-17T10:00:00.000Z", evidence, facts, candidates, matches })
}
