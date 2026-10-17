/**
 * Parser for digital (text-based) bank statement PDFs.
 *
 * The browser extracts positioned text from the PDF (src/lib/evidence/pdf-text.ts) and groups
 * it into lines. This module finds the column header (Date / Description / Reference / Debit /
 * Credit / Balance) and assigns each cell to the nearest column by horizontal position, which is
 * what tells a debit from a credit — the text alone can't.
 *
 * Only the lines the person chooses are sent to the server, which re-parses them. Balances,
 * account-holder names and the person's own account number are never turned into facts.
 * Scanned (image-only) PDFs have no text layer and are reported as unsupported; there is no OCR.
 */
import {
  normalizeAccount,
  normalizeName,
  normalizePaymentMethod,
  normalizeReference,
  normalizeUpiId,
  parseAmountToMinor,
  parseDayFirstDate,
  istInstant,
  normalizeCurrency,
} from "./normalize"
import { evidenceRecordKey, makeFact, type RecordBase } from "./sources"
import type { ExtractedFact } from "./types"
import type { Currency } from "@/types"

export const STATEMENT_PARSER_VERSION = "statement-parser@1"
export const MAX_STATEMENT_LINES = 300

export interface TextCell {
  text: string
  /** Left edge in PDF units. */
  x: number
  width: number
}

/** One visual line of a page. `line` is its 1-based position on the page, so it stays stable whatever is selected. */
export interface StatementLine {
  page: number
  line: number
  cells: TextCell[]
}

export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
}

/** Groups positioned text items on one page into lines, top to bottom, left to right. */
export function groupTextItems(page: number, items: PdfTextItem[], tolerance = 3): StatementLine[] {
  const visible = items.filter((i) => i.str.trim() !== "")
  // PDF y grows upwards: higher y = nearer the top.
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; cells: TextCell[] }[] = []
  for (const item of sorted) {
    const current = lines[lines.length - 1]
    const cell = { text: item.str.trim(), x: item.x, width: item.width }
    if (current && Math.abs(current.y - item.y) <= tolerance) current.cells.push(cell)
    else lines.push({ y: item.y, cells: [cell] })
  }
  return lines.map((l, i) => ({ page, line: i + 1, cells: l.cells.sort((a, b) => a.x - b.x) }))
}

type Column = "date" | "description" | "reference" | "debit" | "credit" | "balance"

/** Checked in this order, so "Balance" never counts as a description and "Value date" counts as a date. */
const HEADER_PATTERNS: [Column, RegExp][] = [
  ["balance", /\bbalance\b/i],
  ["debit", /\b(debit|withdrawals?|dr)\b/i],
  ["credit", /\b(credit|deposits?|cr)\b/i],
  ["date", /\bdate\b/i],
  ["reference", /\b(ref(erence)?|chq|cheque|utr|rrn)\b/i],
  ["description", /\b(description|particulars|narration|details|remarks)\b/i],
]

export interface StatementHeader {
  columns: { column: Column; center: number }[]
  currency: Currency
}

const center = (c: TextCell) => c.x + c.width / 2

export function detectHeader(line: StatementLine): StatementHeader | undefined {
  const columns: StatementHeader["columns"] = []
  let currency: Currency | undefined
  for (const cell of line.cells) {
    const match = HEADER_PATTERNS.find(([, re]) => re.test(cell.text))
    if (!match || columns.some((c) => c.column === match[0])) continue
    columns.push({ column: match[0], center: center(cell) })
    if ((match[0] === "debit" || match[0] === "credit") && !currency) {
      currency = /₹|\binr\b|\brs\b/i.test(cell.text) ? "INR" : normalizeCurrency(/\(([A-Z]{3})\)/.exec(cell.text)?.[1])
    }
  }
  const has = (c: Column) => columns.some((col) => col.column === c)
  if (!has("date") || !(has("debit") || has("credit"))) return undefined
  return { columns, currency: currency ?? "INR" }
}

export interface StatementTransaction {
  page: number
  line: number
  date: string
  description: string
  referenceText?: string
  debitMinor?: number
  creditMinor?: number
  currency: Currency
}

function assign(header: StatementHeader, line: StatementLine) {
  const out: Partial<Record<Column, string>> = {}
  for (const cell of line.cells) {
    let best = header.columns[0]
    for (const col of header.columns) {
      if (Math.abs(col.center - center(cell)) < Math.abs(best.center - center(cell))) best = col
    }
    out[best.column] = out[best.column] ? `${out[best.column]} ${cell.text}` : cell.text
  }
  return out
}

const amountOf = (text?: string) =>
  text && text.trim() !== "-" ? parseAmountToMinor(text.replace(/\s*(dr|cr)\.?$/i, "")) : undefined

/**
 * Finds transaction lines. A header applies to the lines below it on its page and on later
 * pages until another header appears. Lines that aren't dated transactions are ignored.
 */
export function parseStatementLines(lines: StatementLine[]): { headerFound: boolean; transactions: StatementTransaction[] } {
  const ordered = [...lines].sort((a, b) => a.page - b.page || a.line - b.line).slice(0, MAX_STATEMENT_LINES)
  let header: StatementHeader | undefined
  let headerFound = false
  const transactions: StatementTransaction[] = []
  for (const line of ordered) {
    const detected = detectHeader(line)
    if (detected) {
      header = detected
      headerFound = true
      continue
    }
    if (!header) continue
    const cols = assign(header, line)
    const date = cols.date ? parseDayFirstDate(cols.date.split(" ")[0]) : undefined
    if (!date) continue
    const debitMinor = amountOf(cols.debit)
    const creditMinor = amountOf(cols.credit)
    if (debitMinor === undefined && creditMinor === undefined) continue
    transactions.push({
      page: line.page,
      line: line.line,
      date,
      description: (cols.description ?? "").slice(0, 200),
      referenceText: cols.reference?.slice(0, 80),
      debitMinor,
      creditMinor,
      currency: header.currency,
    })
  }
  return { headerFound, transactions }
}

const METHOD_TOKENS = /^(upi|imps|neft|rtgs|bbps|pos|atm|ach|nach|ecs)$/i
const IGNORED_SEGMENTS = /^(collect|payment|pay|transfer|p2p|p2m|dr|cr|rev|reversal|refund|txn)$/i
const REVERSAL = /\b(rev|reversal|reversed|refund|refunded|chargeback)\b/i

/** Facts from the chosen statement lines. Balances are never included. */
export function factsFromStatement(evidenceId: string, transactions: StatementTransaction[]): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  for (const t of transactions) {
    const base: RecordBase = {
      recordKey: `${evidenceRecordKey(evidenceId)}:p${t.page}l${t.line}`,
      recordRole: "transaction",
      sourceType: "bank_statement",
      extractionMethod: "statement_parser",
      extractorVersion: STATEMENT_PARSER_VERSION,
      sourceLocation: `Page ${t.page} · line ${t.line}`,
    }
    // A line with both columns filled is ambiguous; its direction is left unstated.
    const direction =
      t.debitMinor !== undefined && t.creditMinor === undefined
        ? "debit"
        : t.creditMinor !== undefined && t.debitMinor === undefined
          ? "credit"
          : undefined
    const minor = direction === "credit" ? t.creditMinor : (t.debitMinor ?? t.creditMinor)
    if (minor !== undefined) {
      facts.push(
        makeFact(base, "amount", `${t.currency} ${(minor / 100).toFixed(2)}`, {
          normalizedValue: `${t.currency}:${minor}`,
          amountMinor: minor,
          currency: t.currency,
        }),
      )
    }
    if (direction) facts.push(makeFact(base, "transaction_direction", direction, { normalizedValue: direction }))
    const instant = istInstant(t.date)
    if (instant)
      facts.push(
        makeFact(base, "transaction_datetime", t.date, {
          normalizedValue: instant.iso,
          occurredAt: instant.iso,
          timePrecision: "day",
        }),
      )

    const refTokens = (t.referenceText ?? "").split(/\s+/).filter(Boolean)
    const ref = refTokens
      .map((tok) => ({ tok, v: normalizeReference(tok) }))
      .reverse()
      .find((r) => r.v)
    if (ref?.v) facts.push(makeFact(base, "transaction_reference", ref.tok, { normalizedValue: ref.v }))

    const segments = t.description
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
    const methodToken = [refTokens[0], segments[0]].find((s) => s && METHOD_TOKENS.test(s))
    const method = methodToken ? normalizePaymentMethod(methodToken) : undefined
    if (method) facts.push(makeFact(base, "payment_method", methodToken!, { normalizedValue: method }))

    // Free-text descriptions ("SALARY OCT") carry no reliable counterparty; only slash-separated ones are read.
    const parts = segments.length >= 2 ? segments.slice(methodToken && segments[0] === methodToken ? 1 : 0) : []
    for (const seg of parts) {
      if (METHOD_TOKENS.test(seg) || IGNORED_SEGMENTS.test(seg)) continue
      const upi = normalizeUpiId(seg)
      if (upi) {
        facts.push(makeFact(base, "recipient_upi_id", seg, { normalizedValue: upi }))
        continue
      }
      const account = normalizeAccount(seg)
      if (account) {
        facts.push(makeFact(base, "recipient_account", seg, { normalizedValue: account }))
        continue
      }
      // Only multi-word, letter-only segments are treated as the other party's name.
      const name = /^[A-Za-z][A-Za-z .&'-]+ [A-Za-z .&'-]+$/.test(seg) ? normalizeName(seg) : undefined
      if (name && !facts.some((f) => f.recordKey === base.recordKey && f.factType === "recipient_name")) {
        facts.push(makeFact(base, "recipient_name", seg, { normalizedValue: name }))
      }
    }
    if (REVERSAL.test(t.description)) {
      facts.push(makeFact(base, "transaction_status", "Reversal or refund", { normalizedValue: "reversal_or_refund" }))
    }
  }
  return facts
}
