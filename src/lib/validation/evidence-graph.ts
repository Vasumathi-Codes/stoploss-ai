/**
 * Request bodies for the Evidence Intelligence routes. Shared with the client; the server's
 * validation is authoritative and every source is re-parsed there.
 */
import { z } from "zod"

import { MAX_CHAT_CHARS, MAX_CHAT_MESSAGES } from "@/lib/evidence/chat-parser"
import { MAX_STATEMENT_LINES } from "@/lib/evidence/statement-parser"
import { looksLikeCardNumber, noSecrets } from "@/lib/validation/incident"

const cell = z.object({
  text: z.string().max(200),
  x: z.number().min(-100).max(5000),
  width: z.number().min(0).max(5000),
})

const statementLine = z.object({
  page: z.int().min(1).max(500),
  line: z.int().min(1).max(5000),
  cells: z.array(cell).max(24),
})

const chatMessage = z.object({
  /** Position of the message in the full export, so provenance doesn't depend on what was selected. */
  index: z.int().min(1).max(MAX_CHAT_MESSAGES),
  /** The message's own line(s), starting with its timestamp. */
  text: z.string().min(1).max(4000),
})

export const UNSUPPORTED_REASONS = {
  scanned_pdf: "This PDF has no text layer (it may be a scan). Scanned statements can't be read yet.",
  unrecognised_statement: "No statement table (Date / Debit / Credit columns) was found in this PDF.",
  unrecognised_chat: "This text file isn't in a recognised chat-export format.",
  unsupported_type: "This file type can't be analysed. It stays on record as evidence.",
} as const

export const analyzeSourceSchema = z.union([
  z.object({ type: z.literal("screenshot_reading"), evidenceId: z.uuid(), readingId: z.uuid() }),
  z.object({
    type: z.literal("chat_export"),
    evidenceId: z.uuid(),
    messages: z
      .array(chatMessage)
      .min(1)
      .max(MAX_CHAT_MESSAGES)
      .refine((m) => m.reduce((n, x) => n + x.text.length, 0) <= MAX_CHAT_CHARS, "Too much chat text"),
  }),
  z.object({
    type: z.literal("bank_statement"),
    evidenceId: z.uuid(),
    lines: z.array(statementLine).min(2).max(MAX_STATEMENT_LINES),
  }),
  z.object({
    type: z.literal("unsupported"),
    evidenceId: z.uuid(),
    reason: z.enum(
      Object.keys(UNSUPPORTED_REASONS) as [keyof typeof UNSUPPORTED_REASONS, ...(keyof typeof UNSUPPORTED_REASONS)[]],
    ),
  }),
])

export const analyzeBodySchema = z.object({ sources: z.array(analyzeSourceSchema).max(10).default([]) })

const expectedUpdatedAt = z.iso.datetime().optional()

export const factReviewSchema = z.union([
  z.object({ action: z.literal(["confirm", "reject", "mark_needs_verification", "reset"]), expectedUpdatedAt }),
  z.object({
    action: z.literal("correct"),
    value: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(noSecrets, "Don't include PINs, OTPs or passwords")
      .refine((v) => !looksLikeCardNumber(v), "This looks like a card number"),
    expectedUpdatedAt,
  }),
  z.object({ action: z.literal(["review_conflict", "defer_conflict", "reopen_conflict"]), matchId: z.uuid() }),
])

export type AnalyzeSource = z.infer<typeof analyzeSourceSchema>
export type AnalyzeBody = z.input<typeof analyzeBodySchema>
export type FactReviewBody = z.infer<typeof factReviewSchema>
