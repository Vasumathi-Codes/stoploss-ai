/**
 * Deterministic cross-source matching. Pure: no I/O, no AI, same input → same output.
 *
 * 1. Facts are grouped into records (one screenshot, one statement line, one chat message, the case form).
 * 2. Transaction records are clustered into transaction candidates:
 *    - an identical transaction reference (UTR/RRN) joins records — strong identity;
 *    - a record WITHOUT a reference joins a cluster only if exactly one cluster has a record with the
 *      exact same amount AND a compatible date AND no conflicting recipient or direction;
 *    - a record whose reference no other record shares joins only if amount, date AND recipient all match
 *      (its differing reference is then shown as a conflict);
 *    - the case form joins on a matching recipient, or on exact amount + compatible date.
 *    Amount alone, or similar timestamps alone, never join anything. Two lines of the same statement are
 *    never joined except by a shared reference.
 * 3. Every pair of records in a candidate is compared fact type by fact type under the rules in RULES.
 * 4. Context records (chat messages) are linked to transactions only by an identical identifier, or by
 *    the same amount mentioned within a day of the payment.
 *
 * Nothing here decides who did what. An identifier appearing in two places shows only that the records
 * mention the same identifier.
 */
import { formatDate, formatDateTime } from "@/lib/utils/format"

import { fnv1a, formatMinor, istDayDiff, maskValue } from "./normalize"
import type { EngineFact, EvidenceRelation, FactType, MatchOutcome } from "./types"

export const MATCHER_VERSION = "matcher@1"
/** Two exact times within this window are treated as the same moment (clocks and app displays differ). */
export const TIME_TOLERANCE_MS = 10 * 60_000
/** The case form's time is the person's estimate. */
export const REPORTED_TIME_TOLERANCE_MS = 24 * 3_600_000

export const RULES = {
  "ref.exact":
    "Both records show the same transaction reference (UTR/RRN). This is strong evidence they describe the same payment.",
  "ref.different":
    "The records were grouped by other details but show different references. One may be misread or mistyped, or they may be different payments.",
  "amount.exact": "The amounts are identical (compared in paise, same currency).",
  "amount.different": "The amounts differ for records that otherwise look like the same payment.",
  "amount.currency_differs": "The records state different currencies.",
  "amount.reported_differs":
    "The amount in your report differs from the evidence. Reported amounts are often approximate — check which is right.",
  "time.within_tolerance": "The times are within 10 minutes of each other.",
  "time.same_day": "Same date, but the times differ by more than 10 minutes.",
  "date.same_day": "Same date. At least one source shows no time, so only the date can be compared.",
  "date.adjacent_day":
    "The dates are one day apart. Statements often show the posting date, which can be a day after the payment.",
  "time.different": "The dates are more than a day apart.",
  "time.reported_approximate": "Close to the time in your report, which is an estimate.",
  "recipient.exact": "Both records show the same recipient identifier.",
  "recipient.different": "The records show different identifiers of the same kind for the other party.",
  "recipient.masked_partial": "Only the last digits of the account are visible; those digits agree.",
  "name.exact": "The other party's name is the same.",
  "name.partial": "One name contains the other (names are often shortened).",
  "name.different": "The other party's names differ. Banks and apps often show names differently.",
  "direction.same": "Both records show money moving in the same direction.",
  "direction.mismatch":
    "One record shows money leaving the account and the other money arriving. This can be a reversal or refund, or a misread.",
  "method.same": "Both records show the same kind of payment method.",
  "method.different": "The payment method is labelled differently. Apps and banks label methods inconsistently.",
  "link.amount_date":
    "No shared reference. Grouped because the amount is identical, the date is compatible and nothing conflicts. Confirm they are the same payment.",
  "link.recipient": "No shared reference. Grouped because your report names the same recipient identifier as this record.",
  "link.ambiguous": "This record could belong to more than one transaction, so it was not grouped with any of them.",
  "source.possible_duplicate":
    "These two files show identical details and may be copies of the same evidence. They are counted as one source.",
  "context.same_identifier":
    "The conversation mentions the same identifier as this transaction. This links the chat to the payment; it does not show who controls the identifier.",
  "context.amount_near_date":
    "The conversation mentions the same amount within a day of this payment. On its own this does not show it is the same payment.",
} as const

export type RuleId = keyof typeof RULES

export interface EngineResult {
  key: string
  ruleId: RuleId
  outcome: MatchOutcome
  relation: EvidenceRelation
  factAId: string
  factBId: string
  /** The candidate both facts belong to (absent for links that span candidates). */
  candidateKey?: string
  explanation: string
  uncertainty?: string
  requiresReview: boolean
}

export interface EngineCandidate {
  key: string
  recordKeys: string[]
  factIds: string[]
  /** Distinct evidence items, duplicates counted once, the case form excluded. */
  independentSources: number
  /** Fact types on which at least two independent sources agree. */
  corroboratedTypes: FactType[]
  /** Records describing this candidate come only from the case form. */
  reportedOnly: boolean
}

export interface EngineOutput {
  candidates: EngineCandidate[]
  results: EngineResult[]
  /** factId → candidate key, for facts in transaction records. */
  factCandidate: Map<string, string>
}

interface Rec {
  key: string
  role: EngineFact["recordRole"]
  sourceType: EngineFact["sourceType"]
  evidenceId: string | null
  isCase: boolean
  facts: EngineFact[]
}

const RECIPIENT_TYPES: FactType[] = ["recipient_upi_id", "recipient_phone", "recipient_account"]
const COMPARED_TYPES: FactType[] = [
  "transaction_reference",
  "amount",
  "transaction_datetime",
  ...RECIPIENT_TYPES,
  "recipient_name",
  "transaction_direction",
  "payment_method",
]
const CONTEXT_TYPES: FactType[] = ["transaction_reference", ...RECIPIENT_TYPES]

const first = (r: Rec, t: FactType) => r.facts.find((f) => f.factType === t)
const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** Human-readable, masked value for explanations. */
export function describeValue(
  f: Pick<EngineFact, "factType" | "normalizedValue" | "amountMinor" | "currency" | "occurredAt" | "timePrecision">,
) {
  if (f.factType === "amount" && f.amountMinor !== undefined) return formatMinor(f.amountMinor, f.currency)
  if (f.factType === "transaction_datetime" && f.occurredAt !== undefined) {
    const iso = new Date(f.occurredAt).toISOString()
    return f.timePrecision === "day" ? formatDate(iso) : formatDateTime(iso)
  }
  if (f.factType === "recipient_account" && f.normalizedValue.startsWith("masked:")) return `••••${f.normalizedValue.slice(7)}`
  return maskValue(f.factType, f.normalizedValue)
}

function datesCompatible(a: EngineFact, b: EngineFact, statementInvolved: boolean) {
  if (a.occurredAt === undefined || b.occurredAt === undefined) return false
  const days = Math.abs(istDayDiff(a.occurredAt, b.occurredAt))
  return days === 0 || (statementInvolved && days === 1)
}

function sameAmount(a?: EngineFact, b?: EngineFact) {
  return Boolean(a && b && a.amountMinor !== undefined && a.amountMinor === b.amountMinor && a.currency === b.currency)
}

/** Recipient comparison between two records: "same", "conflict", or "none" when not comparable. */
function recipientRelation(a: Rec, b: Rec): "same" | "conflict" | "none" {
  let same = false
  for (const t of RECIPIENT_TYPES) {
    const fa = first(a, t)
    const fb = first(b, t)
    if (!fa || !fb) continue
    if (fa.normalizedValue === fb.normalizedValue) same = true
    else return "conflict"
  }
  return same ? "same" : "none"
}

function directionConflict(a: Rec, b: Rec) {
  const da = first(a, "transaction_direction")
  const db = first(b, "transaction_direction")
  return Boolean(da && db && da.normalizedValue !== db.normalizedValue)
}

/* ------------------------------------------------------------------ */
/* Pairwise comparison                                                 */
/* ------------------------------------------------------------------ */

type Draft = Omit<EngineResult, "key" | "explanation"> & { detail?: string }

function compareFacts(type: FactType, fa: EngineFact, fb: EngineFact, a: Rec, b: Rec): Draft | undefined {
  const base = { factAId: fa.id, factBId: fb.id }
  const reported = a.isCase || b.isCase
  const ok = (ruleId: RuleId, outcome: MatchOutcome = "match", extra: Partial<Draft> = {}): Draft => ({
    ...base,
    ruleId,
    outcome,
    relation: outcome === "conflict" ? "conflicts_with" : "corroborates",
    requiresReview: outcome === "conflict",
    ...extra,
  })

  switch (type) {
    case "transaction_reference":
      return fa.normalizedValue === fb.normalizedValue ? ok("ref.exact") : ok("ref.different", "conflict")
    case "amount":
      if (fa.currency !== fb.currency) return ok("amount.currency_differs", "conflict")
      if (fa.amountMinor === fb.amountMinor) return ok("amount.exact")
      return reported
        ? ok("amount.reported_differs", "conflict", {
            uncertainty: "Your report may have been an estimate made before you checked the transaction.",
          })
        : ok("amount.different", "conflict", { uncertainty: "Could be a misread value, a fee, or a different payment." })
    case "transaction_datetime": {
      if (fa.occurredAt === undefined || fb.occurredAt === undefined) return undefined
      const diff = Math.abs(fa.occurredAt - fb.occurredAt)
      const days = Math.abs(istDayDiff(fa.occurredAt, fb.occurredAt))
      if (reported) {
        if (diff <= TIME_TOLERANCE_MS) return ok("time.within_tolerance")
        if (diff <= REPORTED_TIME_TOLERANCE_MS) return ok("time.reported_approximate", "partial_match")
        return ok("time.different", "conflict", { uncertainty: "The time in your report may be an estimate." })
      }
      const exact = fa.timePrecision === "minute" && fb.timePrecision === "minute"
      if (exact && diff <= TIME_TOLERANCE_MS) return ok("time.within_tolerance")
      if (days === 0)
        return exact
          ? ok("time.same_day", "partial_match", {
              requiresReview: true,
              uncertainty: "A payment's start and completion, or different time zones on a device, can show different times.",
            })
          : ok("date.same_day", "match", { uncertainty: "Only the date can be compared." })
      if (days === 1)
        return ok("date.adjacent_day", "partial_match", {
          uncertainty: "Posting delays and time-zone differences can shift a date by one day.",
        })
      return ok("time.different", "conflict", { uncertainty: "Could be a misread date or a different payment." })
    }
    case "recipient_upi_id":
    case "recipient_phone":
      return fa.normalizedValue === fb.normalizedValue
        ? ok("recipient.exact")
        : ok("recipient.different", "conflict", {
            uncertainty: "Apps sometimes show a merchant's or aggregator's ID instead of the person's. Check with your bank.",
          })
    case "recipient_account": {
      const da = fa.normalizedValue.replace(/^masked:/, "")
      const dbv = fb.normalizedValue.replace(/^masked:/, "")
      const masked = fa.normalizedValue.startsWith("masked:") || fb.normalizedValue.startsWith("masked:")
      if (!masked) return da === dbv ? ok("recipient.exact") : ok("recipient.different", "conflict")
      return da.endsWith(dbv) || dbv.endsWith(da)
        ? ok("recipient.masked_partial", "partial_match", { uncertainty: "Only the last digits are visible." })
        : ok("recipient.different", "conflict", { uncertainty: "Only the last digits are visible." })
    }
    case "recipient_name": {
      if (fa.normalizedValue === fb.normalizedValue) return ok("name.exact")
      if (fa.normalizedValue.includes(fb.normalizedValue) || fb.normalizedValue.includes(fa.normalizedValue))
        return ok("name.partial", "partial_match")
      return ok("name.different", "conflict", { uncertainty: "Names are often abbreviated or formatted differently." })
    }
    case "transaction_direction": {
      if (fa.normalizedValue === fb.normalizedValue) return ok("direction.same")
      const reversal = [a, b].some((r) => first(r, "transaction_status")?.normalizedValue === "reversal_or_refund")
      return ok("direction.mismatch", "conflict", {
        uncertainty: reversal
          ? "One record is labelled as a reversal or refund, which would explain money moving back."
          : "A credit with the same details may be a reversal or refund. Check with your bank.",
      })
    }
    case "payment_method":
      return fa.normalizedValue === fb.normalizedValue
        ? ok("method.same")
        : ok("method.different", "partial_match", { uncertainty: "Labels differ between apps and banks." })
    default:
      return undefined
  }
}

function explain(d: Draft, fa: EngineFact, fb: EngineFact): string {
  const rule = RULES[d.ruleId]
  const values =
    fa.normalizedValue === fb.normalizedValue && d.outcome !== "conflict"
      ? describeValue(fa)
      : `${describeValue(fa)} vs ${describeValue(fb)}`
  return `${rule} (${values})`.slice(0, 600)
}

function finish(d: Draft, facts: Map<string, EngineFact>): EngineResult {
  const fa = facts.get(d.factAId)!
  const fb = facts.get(d.factBId)!
  // Symmetric rules use a sorted pair so the key doesn't depend on record order; context links are directional.
  const ordered = d.relation === "related_context" || fa.id < fb.id ? [fa, fb] : [fb, fa]
  const key = `${d.ruleId}:${ordered[0].id}:${ordered[1].id}:${fnv1a(`${ordered[0].normalizedValue}|${ordered[1].normalizedValue}`)}`
  return { ...d, key, explanation: explain(d, fa, fb) }
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export function runMatching(input: EngineFact[]): EngineOutput {
  const facts = input.filter((f) => f.reviewStatus !== "user_rejected")
  const factById = new Map(facts.map((f) => [f.id, f]))

  const recMap = new Map<string, Rec>()
  for (const f of [...facts].sort((a, b) => (a.factKey < b.factKey ? -1 : 1))) {
    let rec = recMap.get(f.recordKey)
    if (!rec) {
      rec = {
        key: f.recordKey,
        role: f.recordRole,
        sourceType: f.sourceType,
        evidenceId: f.evidenceId,
        isCase: f.sourceType === "case_details",
        facts: [],
      }
      recMap.set(f.recordKey, rec)
    }
    rec.facts.push(f)
  }
  const records = [...recMap.values()].sort(byKey)
  const txRecords = records.filter((r) => r.role === "transaction")
  const contextRecords = records.filter((r) => r.role === "context")

  // Union-find over record keys.
  const parent = new Map(txRecords.map((r) => [r.key, r.key]))
  const find = (k: string): string => {
    const p = parent.get(k)!
    if (p === k) return k
    const root = find(p)
    parent.set(k, root)
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }

  // 1. Identical references.
  const refOwner = new Map<string, string>()
  const refCount = new Map<string, number>()
  for (const r of txRecords)
    for (const f of r.facts.filter((x) => x.factType === "transaction_reference")) {
      refCount.set(f.normalizedValue, (refCount.get(f.normalizedValue) ?? 0) + 1)
      const owner = refOwner.get(f.normalizedValue)
      if (owner) union(owner, r.key)
      else refOwner.set(f.normalizedValue, r.key)
    }

  // 2. Records still on their own may link to exactly one compatible cluster.
  const drafts: Draft[] = []
  const members = () => {
    const m = new Map<string, Rec[]>()
    for (const r of txRecords) {
      const root = find(r.key)
      const list = m.get(root)
      if (list) list.push(r)
      else m.set(root, [r])
    }
    return m
  }
  for (const r of txRecords) {
    const clusters = members()
    if (clusters.get(find(r.key))!.length > 1) continue
    const ref = first(r, "transaction_reference")
    const uniqueRef = ref && refCount.get(ref.normalizedValue) === 1

    const linkVia = (s: Rec): "amount_date" | "recipient" | undefined => {
      if (s.key === r.key) return undefined
      if (!r.isCase && !s.isCase && r.evidenceId && r.evidenceId === s.evidenceId) return undefined
      const recipients = recipientRelation(r, s)
      if (recipients === "conflict" || directionConflict(r, s)) return undefined
      const amountOk = sameAmount(first(r, "amount"), first(s, "amount"))
      const da = first(r, "transaction_datetime")
      const ds = first(s, "transaction_datetime")
      const dateOk = Boolean(
        da && ds && datesCompatible(da, ds, r.sourceType === "bank_statement" || s.sourceType === "bank_statement"),
      )
      if (r.isCase || s.isCase) return recipients === "same" ? "recipient" : amountOk && dateOk ? "amount_date" : undefined
      if (uniqueRef) return amountOk && dateOk && recipients === "same" ? "amount_date" : undefined
      return amountOk && dateOk ? "amount_date" : undefined
    }

    const compatible: { root: string; via: Rec; basis: "amount_date" | "recipient" }[] = []
    for (const [root, recs] of clusters) {
      if (root === find(r.key)) continue
      for (const s of recs) {
        const basis = linkVia(s)
        if (basis) {
          compatible.push({ root, via: s, basis })
          break
        }
      }
    }
    const anchor = (rec: Rec, basis: "amount_date" | "recipient") =>
      basis === "recipient" ? RECIPIENT_TYPES.map((t) => first(rec, t)).find(Boolean) : first(rec, "amount")
    if (compatible.length === 1) {
      const { via, basis } = compatible[0]
      union(r.key, via.key)
      const fa = anchor(r, basis)
      const fb =
        basis === "recipient"
          ? RECIPIENT_TYPES.map((t) => first(via, t)).find((f) => f && f.factType === fa?.factType)
          : first(via, "amount")
      if (fa && fb)
        drafts.push({
          factAId: fa.id,
          factBId: fb.id,
          ruleId: basis === "recipient" ? "link.recipient" : "link.amount_date",
          outcome: "partial_match",
          relation: "possibly_same_transaction",
          requiresReview: true,
        })
    } else if (compatible.length > 1) {
      for (const { via } of compatible.slice(0, 3)) {
        const fa = first(r, "amount")
        const fb = first(via, "amount")
        if (fa && fb)
          drafts.push({
            factAId: fa.id,
            factBId: fb.id,
            ruleId: "link.ambiguous",
            outcome: "insufficient_evidence",
            relation: "possibly_same_transaction",
            requiresReview: true,
          })
      }
    }
  }

  // 3. Candidates and pairwise comparisons.
  const clusters = [...members().values()]
  const candidates: EngineCandidate[] = []
  const factCandidate = new Map<string, string>()
  const results: EngineResult[] = []

  for (const recs of clusters) {
    recs.sort(byKey)
    const refs = recs
      .flatMap((r) => r.facts.filter((f) => f.factType === "transaction_reference").map((f) => f.normalizedValue))
      .sort()
    const evidenceRecs = recs.filter((r) => !r.isCase)
    const key = refs.length > 0 ? `ref:${refs[0]}` : `rec:${(evidenceRecs[0] ?? recs[0]).key}`
    for (const r of recs) for (const f of r.facts) factCandidate.set(f.id, key)

    // Independent sources: evidence items, merging likely duplicates.
    const group = new Map(evidenceRecs.map((r) => [r.key, r.evidenceId ?? r.key]))
    const local: Draft[] = []
    for (let i = 0; i < recs.length; i++)
      for (let j = i + 1; j < recs.length; j++) {
        const a = recs[i]
        const b = recs[j]
        const pair: Draft[] = []
        for (const t of COMPARED_TYPES) {
          const fa = first(a, t)
          const fb = first(b, t)
          if (!fa || !fb) continue
          const d = compareFacts(t, fa, fb, a, b)
          if (d) pair.push({ ...d, candidateKey: key })
        }
        const duplicate =
          !a.isCase &&
          !b.isCase &&
          a.sourceType === b.sourceType &&
          a.evidenceId !== b.evidenceId &&
          pair.length >= 3 &&
          pair.every((d) => d.outcome === "match") &&
          a.facts.length === b.facts.length
        if (duplicate) {
          group.set(b.key, group.get(a.key)!)
          const fa = first(a, "transaction_reference") ?? first(a, "amount")!
          const fb = first(b, "transaction_reference") ?? first(b, "amount")!
          local.push({
            factAId: fa.id,
            factBId: fb.id,
            ruleId: "source.possible_duplicate",
            outcome: "insufficient_evidence",
            relation: "possibly_same_transaction",
            requiresReview: false,
            candidateKey: key,
          })
        }
        local.push(...pair)
      }

    // Corroborated: an exact match between two different independent sources (never the case form).
    const corroborated = new Set<FactType>()
    for (const d of local) {
      if (d.outcome !== "match" || d.relation !== "corroborates") continue
      const fa = factById.get(d.factAId)!
      const fb = factById.get(d.factBId)!
      if (fa.sourceType === "case_details" || fb.sourceType === "case_details") continue
      if (group.get(fa.recordKey) !== group.get(fb.recordKey)) corroborated.add(fa.factType)
    }

    candidates.push({
      key,
      recordKeys: recs.map((r) => r.key),
      factIds: recs.flatMap((r) => r.facts.map((f) => f.id)),
      independentSources: new Set(group.values()).size,
      corroboratedTypes: COMPARED_TYPES.filter((t) => corroborated.has(t)),
      reportedOnly: evidenceRecs.length === 0,
    })
    drafts.push(...local)
  }

  // Link drafts were created before candidates had keys.
  for (const d of drafts) {
    if (d.candidateKey === undefined && d.ruleId !== "link.ambiguous") d.candidateKey = factCandidate.get(d.factAId)
    results.push(finish(d, factById))
  }

  // 4. Context links (chat messages and non-payment screenshots).
  const txFacts = txRecords.flatMap((r) => r.facts)
  // A transaction's time lives on its record's date fact, not on the amount fact.
  const txTime = new Map(txRecords.map((r) => [r.key, first(r, "transaction_datetime")?.occurredAt]))
  for (const c of contextRecords) {
    for (const cf of c.facts) {
      const linked = new Set<string>()
      for (const tf of txFacts) {
        const cand = factCandidate.get(tf.id)!
        if (linked.has(cand) || tf.factType !== cf.factType) continue
        let ruleId: RuleId | undefined
        if (CONTEXT_TYPES.includes(cf.factType) && tf.normalizedValue === cf.normalizedValue) ruleId = "context.same_identifier"
        else if (
          cf.factType === "amount" &&
          sameAmount(cf, tf) &&
          cf.occurredAt !== undefined &&
          txTime.get(tf.recordKey) !== undefined &&
          Math.abs(istDayDiff(cf.occurredAt, txTime.get(tf.recordKey)!)) <= 1
        )
          ruleId = "context.amount_near_date"
        if (!ruleId) continue
        linked.add(cand)
        results.push(
          finish(
            {
              factAId: cf.id,
              factBId: tf.id,
              ruleId,
              outcome: ruleId === "context.same_identifier" ? "match" : "partial_match",
              relation: "related_context",
              requiresReview: false,
              candidateKey: cand,
            },
            factById,
          ),
        )
      }
    }
  }

  // Duplicate keys can't arise from distinct pairs, but guard so persistence stays idempotent.
  const unique = new Map(results.map((r) => [r.key, r]))
  return { candidates: candidates.sort(byKey), results: [...unique.values()], factCandidate }
}
