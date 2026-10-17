/**
 * Deterministic normalisation of extracted facts.
 *
 * Every function keeps the displayed value separate from the comparison value and
 * returns `undefined` rather than guessing. Rules:
 * - Amounts become integer minor units (paise), parsed from decimal strings: no floating point.
 * - Transaction references only lose whitespace and are upper-cased; any other character makes
 *   the value invalid, so two different references can never collapse into one.
 * - UPI IDs are lower-cased (UPI virtual payment addresses are case-insensitive) and otherwise untouched.
 * - Indian mobile numbers become +91XXXXXXXXXX; other phone formats are kept only with an explicit country code.
 * - Dates without a zone are India time (Asia/Kolkata, UTC+05:30) — never the server's time zone.
 * - Values that look like card numbers, OTPs or PINs are rejected outright.
 */
import { CURRENCIES } from "@/lib/config/taxonomy"
import { looksLikeCardNumber, noSecrets } from "@/lib/validation/incident"
import { formatCurrency } from "@/lib/utils/format"
import type { Currency } from "@/types"

import type { FactType, TimePrecision } from "./types"

export const IST_OFFSET = "+05:30"
const IST_OFFSET_MS = 330 * 60_000
const MAX_AMOUNT_MINOR = 1_000_000_000 * 100

/* ------------------------------------------------------------------ */
/* Amounts                                                             */
/* ------------------------------------------------------------------ */

/**
 * "₹18,500.00", "Rs. 18500", "18,500" or 18500 → 1850000 (paise).
 * Indian digit grouping (1,00,000) is accepted. Zero, negative and malformed values are rejected.
 */
export function parseAmountToMinor(input: string | number): number | undefined {
  let text: string
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return undefined
    text = input.toFixed(2)
  } else {
    text = input
      .trim()
      .replace(/^(₹|rs\.?|inr)\s*/i, "")
      .replace(/\s*(₹|rs\.?|inr|\/-)$/i, "")
      .trim()
    if (!/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(text)) return undefined
    text = text.replace(/,/g, "")
  }
  const [whole, fraction = ""] = text.split(".")
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT_MINOR) return undefined
  return minor
}

export function formatMinor(minor: number, currency: Currency = "INR") {
  return formatCurrency(minor / 100, currency)
}

export function normalizeCurrency(raw: string | undefined | null): Currency | undefined {
  if (!raw) return undefined
  const v = raw.trim().toUpperCase()
  if (v === "₹" || v === "RS" || v === "RS." || v === "RUPEES") return "INR"
  return CURRENCIES.includes(v as Currency) ? (v as Currency) : undefined
}

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

/** UTR / RRN / transaction id. Whitespace removed, letters upper-cased, nothing else changed. */
export function normalizeReference(raw: string): string | undefined {
  const ref = raw.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z0-9]{6,35}$/.test(ref)) return undefined
  if (looksLikeCardNumber(ref) || !noSecrets(raw)) return undefined
  // Long pure-digit runs are only accepted at the 12-digit UTR/RRN length (matches the report form).
  if (/^\d{13,19}$/.test(ref)) return undefined
  return ref
}

const UPI_PATTERN = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/

export function normalizeUpiId(raw: string): string | undefined {
  const v = raw.trim().toLowerCase()
  return UPI_PATTERN.test(v) ? v : undefined
}

/** "+91 98765 43210", "098765-43210" → "+919876543210". */
export function normalizePhone(raw: string): string | undefined {
  const v = raw.trim()
  if (!/^\+?[\d\s()-]{8,20}$/.test(v)) return undefined
  const digits = v.replace(/\D/g, "")
  if (looksLikeCardNumber(digits)) return undefined
  let national = digits
  if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1)
  if (/^[6-9]\d{9}$/.test(national)) return `+91${national}`
  if (v.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return undefined
}

/**
 * Bank accounts. Masked forms ("XXXX9921", "A/c XX4821", "****1234") keep only the visible digits,
 * prefixed so they never equal a full number: "masked:9921". Full numbers keep their digits.
 */
export function normalizeAccount(raw: string): string | undefined {
  const v = raw.trim().replace(/^a\/?c\.?\s*(no\.?)?\s*/i, "")
  const masked = /^[xX*•]{2,}[\s-]?(\d{3,6})$/.exec(v)
  if (masked) return `masked:${masked[1]}`
  const digits = v.replace(/[\s-]/g, "")
  if (/^\d{9,18}$/.test(digits) && !looksLikeCardNumber(digits)) return digits
  return undefined
}

export function normalizeName(raw: string): string | undefined {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[.,]+$/g, "")
    .replace(/\s+/g, " ")
  if (v.length < 2 || v.length > 120 || !/[a-z]/.test(v) || !noSecrets(v)) return undefined
  return v
}

/** Payment methods compared by category, so "UPI app" and "UPI/collect" agree. */
export function normalizePaymentMethod(raw: string): string | undefined {
  const v = raw.toLowerCase()
  if (/\bupi\b/.test(v)) return "upi"
  if (/\b(imps|neft|rtgs)\b|bank transfer/.test(v)) return "bank_transfer"
  if (/net\s*banking/.test(v)) return "net_banking"
  if (/credit card/.test(v)) return "credit_card"
  if (/debit card|\bcard\b|\bpos\b/.test(v)) return "card"
  if (/wallet/.test(v)) return "wallet"
  if (/bbps|bill/.test(v)) return "bill_payment"
  if (/crypto|trading/.test(v)) return "crypto_trading"
  if (/marketplace|social/.test(v)) return "marketplace"
  return v.trim() ? "other" : undefined
}

export type Counterparty = { factType: Extract<FactType, `recipient_${string}`>; normalized: string }

/** Classifies a free-text counterparty (as typed or read) into the matching identifier type. */
export function classifyCounterparty(raw: string): Counterparty | undefined {
  const v = raw.trim()
  if (!v || !noSecrets(v) || looksLikeCardNumber(v)) return undefined
  if (v.includes("@")) {
    const upi = normalizeUpiId(v)
    return upi ? { factType: "recipient_upi_id", normalized: upi } : undefined
  }
  const phone = normalizePhone(v)
  if (phone) return { factType: "recipient_phone", normalized: phone }
  const account = normalizeAccount(v)
  if (account) return { factType: "recipient_account", normalized: account }
  const name = normalizeName(v)
  return name ? { factType: "recipient_name", normalized: name } : undefined
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/**
 * Day-first Indian dates: "15-10-2026", "15/10/26", "15-Oct-2026", "15 Oct 2026" → "2026-10-15".
 * Returns undefined for impossible dates rather than rolling them over.
 */
export function parseDayFirstDate(raw: string): string | undefined {
  const m = /^(\d{1,2})[-/. ](\d{1,2}|[A-Za-z]{3,9})[-/. ,]+(\d{2}|\d{4})$/.exec(raw.trim())
  if (!m) return undefined
  const day = Number(m[1])
  const month = /^\d/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const check = new Date(`${iso}T00:00:00Z`)
  if (check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) return undefined
  return iso
}

/** "14:52", "2:52 pm", "14:31:02" → "14:52" (24-hour). */
export function parseClockTime(raw: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(raw.trim())
  if (!m) return undefined
  let hour = Number(m[1])
  const minute = Number(m[2])
  const meridiem = m[3]?.toLowerCase().replace(/\./g, "")
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined
    if (meridiem === "pm" && hour !== 12) hour += 12
    if (meridiem === "am" && hour === 12) hour = 0
  }
  if (hour > 23 || minute > 59) return undefined
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** India-time date (+ optional time) → ISO instant and its precision. A missing time is stored as noon, precision "day". */
export function istInstant(date: string, time?: string): { iso: string; precision: TimePrecision } | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  const t = time ?? "12:00"
  const ms = Date.parse(`${date}T${t}:00${IST_OFFSET}`)
  if (Number.isNaN(ms)) return undefined
  return { iso: new Date(ms).toISOString(), precision: time ? "minute" : "day" }
}

/** The India calendar date of an instant, "YYYY-MM-DD". */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Whole calendar days between two instants' India dates. */
export function istDayDiff(a: number, b: number): number {
  return Math.round((Date.parse(istDate(a)) - Date.parse(istDate(b))) / 86_400_000)
}

/** Corrections typed as "2026-10-15T14:52" or "2026-10-15" (India time). */
export function parseDateTimeInput(raw: string): { iso: string; precision: TimePrecision } | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/.exec(raw.trim())
  if (!m) return undefined
  const result = istInstant(m[1], m[2])
  if (!result || Date.parse(result.iso) > Date.now() + 5 * 60_000) return undefined
  return result
}

/* ------------------------------------------------------------------ */
/* Corrections: one entry point per fact type                          */
/* ------------------------------------------------------------------ */

export interface NormalizedValue {
  normalizedValue: string
  amountMinor?: number
  currency?: Currency
  occurredAt?: string
  timePrecision?: TimePrecision
}

/** Fact types a person can correct by typing a value. */
export const CORRECTABLE_TYPES: FactType[] = [
  "amount",
  "transaction_reference",
  "transaction_datetime",
  "recipient_upi_id",
  "recipient_phone",
  "recipient_account",
  "recipient_name",
  "payment_method",
]

/** Normalises a typed value for a fact type, or undefined if it isn't valid for that type. */
export function normalizeForType(factType: FactType, raw: string, currency: Currency = "INR"): NormalizedValue | undefined {
  if (!noSecrets(raw) || looksLikeCardNumber(raw)) return undefined
  switch (factType) {
    case "amount": {
      const minor = parseAmountToMinor(raw)
      return minor === undefined ? undefined : { normalizedValue: `${currency}:${minor}`, amountMinor: minor, currency }
    }
    case "transaction_reference": {
      const ref = normalizeReference(raw)
      return ref ? { normalizedValue: ref } : undefined
    }
    case "transaction_datetime": {
      const dt = parseDateTimeInput(raw)
      return dt ? { normalizedValue: dt.iso, occurredAt: dt.iso, timePrecision: dt.precision } : undefined
    }
    case "recipient_upi_id": {
      const v = normalizeUpiId(raw)
      return v ? { normalizedValue: v } : undefined
    }
    case "recipient_phone": {
      const v = normalizePhone(raw)
      return v ? { normalizedValue: v } : undefined
    }
    case "recipient_account": {
      const v = normalizeAccount(raw)
      return v ? { normalizedValue: v } : undefined
    }
    case "recipient_name": {
      const v = normalizeName(raw)
      return v ? { normalizedValue: v } : undefined
    }
    case "payment_method": {
      const v = normalizePaymentMethod(raw)
      return v ? { normalizedValue: v } : undefined
    }
    default:
      return undefined
  }
}

/* ------------------------------------------------------------------ */
/* Masking for display                                                 */
/* ------------------------------------------------------------------ */

const last = (s: string, n: number) => s.slice(Math.max(0, s.length - n))

/** Masks identifiers for the graph. Amounts, dates and categories are shown as-is. */
export function maskValue(factType: FactType, value: string): string {
  switch (factType) {
    case "transaction_reference":
      return value.length <= 4 ? value : `••••${last(value, 4)}`
    case "recipient_upi_id": {
      const [local, handle] = value.split("@")
      return `${local.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${handle ?? ""}`
    }
    case "recipient_phone": {
      const digits = value.replace(/\D/g, "")
      return `••••••${last(digits, 4)}`
    }
    case "recipient_account": {
      const digits = value.replace(/\D/g, "")
      return `••••${last(digits, 4)}`
    }
    default:
      return value
  }
}

/* ------------------------------------------------------------------ */
/* Stable hashing for keys                                             */
/* ------------------------------------------------------------------ */

/** 32-bit FNV-1a, hex. Used only to keep stable keys short; not for security. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
