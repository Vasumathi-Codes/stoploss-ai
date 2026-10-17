/**
 * Source adapters: turn one source's already-screened output into normalised facts with provenance.
 * Screenshot readings come from the existing Screenshot Reader (src/server/foundry/extract.ts);
 * case facts come from what the person typed into the report form.
 */
import type { Incident, ScreenshotReading } from "@/types"

import {
  classifyCounterparty,
  normalizePaymentMethod,
  normalizeReference,
  parseAmountToMinor,
  type NormalizedValue,
} from "./normalize"
import type { ExtractedFact, ExtractionMethod, FactType, RecordRole, SourceType } from "./types"

export interface RecordBase {
  recordKey: string
  recordRole: RecordRole
  sourceType: SourceType
  extractionMethod: ExtractionMethod
  extractorVersion?: string
  sourceLocation?: string
}

/** Builds one fact. The fact key is the record key plus the type (and an ordinal when a record has several). */
export function makeFact(
  base: RecordBase,
  factType: FactType,
  rawValue: string,
  value: NormalizedValue,
  ordinal?: number,
): ExtractedFact {
  return {
    ...base,
    factKey: `${base.recordKey}:${factType}${ordinal ? `:${ordinal}` : ""}`,
    factType,
    rawValue: rawValue.trim().slice(0, 200),
    normalizedValue: value.normalizedValue.slice(0, 200),
    amountMinor: value.amountMinor,
    currency: value.currency,
    occurredAt: value.occurredAt,
    timePrecision: value.timePrecision,
  }
}

export const evidenceRecordKey = (evidenceId: string) => `ev:${evidenceId}`
export const CASE_RECORD_KEY = "case"

const SCREENSHOT_SOURCE: Record<ScreenshotReading["kind"], SourceType> = {
  bank_sms: "sms_notification",
  payment_app: "payment_screenshot",
  bank_statement: "bank_statement",
  chat: "chat_export",
  other: "other_document",
}

/** Facts from one Screenshot Reader result. No location is recorded: the reader returns none. */
export function factsFromScreenshot(evidenceId: string, reading: ScreenshotReading, extractorVersion: string): ExtractedFact[] {
  const base: RecordBase = {
    recordKey: evidenceRecordKey(evidenceId),
    // A chat screenshot or anything that isn't a payment record only gives context.
    recordRole: reading.isPaymentRecord && reading.kind !== "chat" ? "transaction" : "context",
    sourceType: SCREENSHOT_SOURCE[reading.kind],
    extractionMethod: "vision_model",
    extractorVersion,
  }
  const facts: ExtractedFact[] = []
  if (reading.amount !== undefined) {
    const minor = parseAmountToMinor(reading.amount)
    const currency = reading.currency ?? "INR"
    if (minor !== undefined)
      facts.push(
        makeFact(base, "amount", `${currency} ${reading.amount}`, {
          normalizedValue: `${currency}:${minor}`,
          amountMinor: minor,
          currency,
        }),
      )
  }
  if (reading.occurredAt) {
    const precision = reading.occurredAtPrecision ?? "minute"
    facts.push(
      makeFact(base, "transaction_datetime", reading.occurredAt, {
        normalizedValue: reading.occurredAt,
        occurredAt: reading.occurredAt,
        timePrecision: precision,
      }),
    )
  }
  if (reading.direction !== "unclear") {
    facts.push(makeFact(base, "transaction_direction", reading.direction, { normalizedValue: reading.direction }))
  }
  const ref = reading.transactionRef ? normalizeReference(reading.transactionRef) : undefined
  if (ref) facts.push(makeFact(base, "transaction_reference", reading.transactionRef!, { normalizedValue: ref }))
  const party = reading.counterparty ? classifyCounterparty(reading.counterparty) : undefined
  if (party) facts.push(makeFact(base, party.factType, reading.counterparty!, { normalizedValue: party.normalized }))
  const method = reading.paymentMethod ? normalizePaymentMethod(reading.paymentMethod) : undefined
  if (method) facts.push(makeFact(base, "payment_method", reading.paymentMethod!, { normalizedValue: method }))
  return facts
}

/** Facts the person typed into the case. The amount and time are their own (often approximate) account. */
export function factsFromCase(
  incident: Pick<Incident, "amount" | "currency" | "occurredAt" | "paymentMethod" | "transactionRef" | "counterparty">,
): ExtractedFact[] {
  const base: RecordBase = {
    recordKey: CASE_RECORD_KEY,
    recordRole: "transaction",
    sourceType: "case_details",
    extractionMethod: "user_entry",
    sourceLocation: "Case form",
  }
  const facts: ExtractedFact[] = []
  const minor = incident.amount > 0 ? parseAmountToMinor(incident.amount) : undefined
  if (minor !== undefined)
    facts.push(
      makeFact(base, "amount", `${incident.currency} ${incident.amount}`, {
        normalizedValue: `${incident.currency}:${minor}`,
        amountMinor: minor,
        currency: incident.currency,
      }),
    )
  facts.push(
    makeFact(base, "transaction_datetime", incident.occurredAt, {
      normalizedValue: incident.occurredAt,
      occurredAt: incident.occurredAt,
      timePrecision: "minute",
    }),
  )
  const method = normalizePaymentMethod(incident.paymentMethod)
  if (method) facts.push(makeFact(base, "payment_method", incident.paymentMethod, { normalizedValue: method }))
  const ref = incident.transactionRef ? normalizeReference(incident.transactionRef) : undefined
  if (ref) facts.push(makeFact(base, "transaction_reference", incident.transactionRef!, { normalizedValue: ref }))
  const party = incident.counterparty ? classifyCounterparty(incident.counterparty) : undefined
  if (party) facts.push(makeFact(base, party.factType, incident.counterparty!, { normalizedValue: party.normalized }))
  return facts
}
