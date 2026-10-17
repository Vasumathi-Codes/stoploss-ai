/**
 * Conservative parser for chat exports (WhatsApp-style .txt).
 *
 * Supported line formats (day-first dates, India time assumed):
 *   [15/10/26, 14:31:02] Name: message
 *   15/10/2026, 2:31 pm - Name: message
 * Lines that don't start a message are appended to the previous one.
 *
 * Only identifiers and a few fixed event types are extracted. Message text and sender
 * names are never stored. Messages that contain an OTP, PIN or password are not mined
 * for identifiers at all; only the fact that one was present is recorded.
 * Nothing in a message is ever executed or followed — it is treated as plain data.
 */
import { formatDateTime } from "@/lib/utils/format"
import { CARD_NUMBER_PATTERN, looksLikeCardNumber, noSecrets } from "@/lib/validation/incident"

import {
  istInstant,
  normalizePhone,
  normalizeReference,
  normalizeUpiId,
  parseAmountToMinor,
  parseClockTime,
  parseDayFirstDate,
} from "./normalize"
import { evidenceRecordKey, makeFact, type RecordBase } from "./sources"
import type { ExtractedFact } from "./types"

export const CHAT_PARSER_VERSION = "chat-parser@1"
/** Upper bounds keep parsing cheap and the request small. */
export const MAX_CHAT_CHARS = 60_000
export const MAX_CHAT_MESSAGES = 400

export interface ChatMessage {
  /** 1-based position in the export. */
  index: number
  /** ISO instant, when the line carried a parseable timestamp. */
  at?: string
  text: string
  /** The message's original line(s), header included: what is sent when the person picks it. */
  raw: string
}

const BRACKET = /^\[(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)\]\s*([^:]{1,60}):\s?(.*)$/i
const DASH = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)\s+-\s+([^:]{1,60}):\s?(.*)$/i

export function parseChatExport(text: string): { messages: ChatMessage[]; recognised: boolean } {
  const messages: ChatMessage[] = []
  for (const line of text.slice(0, MAX_CHAT_CHARS).split(/\r?\n/)) {
    const m = BRACKET.exec(line) ?? DASH.exec(line)
    if (m) {
      if (messages.length >= MAX_CHAT_MESSAGES) break
      const date = parseDayFirstDate(m[1])
      const time = parseClockTime(m[2])
      const instant = date ? istInstant(date, time) : undefined
      messages.push({ index: messages.length + 1, at: instant?.iso, text: m[4], raw: line })
    } else if (messages.length > 0 && line.trim()) {
      messages[messages.length - 1].text += `\n${line}`
      messages[messages.length - 1].raw += `\n${line}`
    }
  }
  return { messages, recognised: messages.length > 0 }
}

/** Fixed, conservative event rules. The value stored is the rule id, never the message. */
export const MESSAGE_EVENTS = {
  payment_request: {
    label: "Payment request mentioned",
    pattern:
      /\b(collect\s+request|request\s+(sent|from)|approve\s+(the\s+|my\s+|this\s+|one\s+more\s+)?(upi\s+)?request|sending\s+(you\s+)?a\s+request)\b/i,
  },
  asks_for_pin_or_otp: {
    label: "Asks for a PIN or OTP",
    pattern: /\b(enter|share|send|give|tell)\b.{0,25}\b(upi\s*pin|m?pin|otp|cvv)\b/i,
  },
  refund_promise: {
    label: "Promise to refund or return money",
    pattern: /\b(will\s+(return|refund)|return\s+(double|your\s+money|the\s+money)|refund\s+(you|your))\b/i,
  },
  debit_reported: {
    label: "Money reported as debited",
    pattern: /\b(debited|deducted|money\s+(got\s+)?cut)\b/i,
  },
  sensitive_value_withheld: {
    label: "Message contained an OTP, PIN or card number (not stored)",
    pattern: /$^/,
  },
} as const

export type MessageEvent = keyof typeof MESSAGE_EVENTS

const UPI_IN_TEXT = /\b[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,63}\b(?!\.[a-z])/gi
const PHONE_IN_TEXT = /(?<![\d+])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g
const AMOUNT_IN_TEXT = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rs\b|rupees\b|inr\b|\/-)/gi
const REF_IN_TEXT =
  /\b(?:utr|rrn|upi\s*ref(?:erence)?(?:\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number|id)|txn\s*(?:id|no\.?)|transaction\s*(?:id|no\.?))\s*[:#-]?\s*([A-Za-z0-9]{10,22})\b/gi

/** True when a message carries a secret or something that looks like a card number. */
function hasSensitiveValue(text: string) {
  if (!noSecrets(text)) return true
  const runs = text.match(new RegExp(CARD_NUMBER_PATTERN, "g")) ?? []
  return runs.some((r) => looksLikeCardNumber(r))
}

/**
 * Facts from the chosen messages of one chat export. Each message is its own context record,
 * located by its index and timestamp.
 */
export function factsFromChat(evidenceId: string, messages: ChatMessage[]): ExtractedFact[] {
  const facts: ExtractedFact[] = []
  for (const msg of messages) {
    const base: RecordBase = {
      recordKey: `${evidenceRecordKey(evidenceId)}:msg:${msg.index}`,
      recordRole: "context",
      sourceType: "chat_export",
      extractionMethod: "chat_parser",
      extractorVersion: CHAT_PARSER_VERSION,
      sourceLocation: `Message ${msg.index}${msg.at ? ` · ${formatDateTime(msg.at)}` : ""}`,
    }
    // Every fact carries the message time, used only to judge whether a mention is near a payment.
    const at = msg.at ? { occurredAt: msg.at, timePrecision: "minute" as const } : {}
    const seen = new Map<string, number>()
    const ordinal = (key: string) => {
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return n === 1 ? undefined : n
    }
    const event = (name: MessageEvent) =>
      facts.push(makeFact(base, "message_event", MESSAGE_EVENTS[name].label, { normalizedValue: name, ...at }, ordinal(name)))

    if (hasSensitiveValue(msg.text)) {
      event("sensitive_value_withheld")
      continue
    }
    for (const name of Object.keys(MESSAGE_EVENTS) as MessageEvent[]) {
      if (MESSAGE_EVENTS[name].pattern.test(msg.text)) event(name)
    }
    for (const raw of new Set(msg.text.match(UPI_IN_TEXT) ?? [])) {
      const v = normalizeUpiId(raw)
      if (v) facts.push(makeFact(base, "recipient_upi_id", raw, { normalizedValue: v, ...at }, ordinal("upi")))
    }
    for (const raw of new Set(msg.text.match(PHONE_IN_TEXT) ?? [])) {
      const v = normalizePhone(raw)
      if (v) facts.push(makeFact(base, "recipient_phone", raw, { normalizedValue: v, ...at }, ordinal("phone")))
    }
    const amounts = new Set<number>()
    for (const m of msg.text.matchAll(AMOUNT_IN_TEXT)) {
      const minor = parseAmountToMinor(m[1] ?? m[2])
      if (minor === undefined || amounts.has(minor)) continue
      amounts.add(minor)
      facts.push(
        makeFact(
          base,
          "amount",
          m[0],
          { normalizedValue: `INR:${minor}`, amountMinor: minor, currency: "INR", ...at },
          ordinal("amount"),
        ),
      )
    }
    for (const m of msg.text.matchAll(REF_IN_TEXT)) {
      const v = normalizeReference(m[1])
      if (v) facts.push(makeFact(base, "transaction_reference", m[1], { normalizedValue: v, ...at }, ordinal("ref")))
    }
  }
  return facts
}

/** Messages worth offering by default: those with any extractable fact. */
export function messagesWithFacts(evidenceId: string, messages: ChatMessage[]): Set<number> {
  const keys = new Set(factsFromChat(evidenceId, messages).map((f) => f.recordKey))
  return new Set(messages.filter((m) => keys.has(`${evidenceRecordKey(evidenceId)}:msg:${m.index}`)).map((m) => m.index))
}
