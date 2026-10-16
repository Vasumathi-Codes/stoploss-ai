/**
 * Request bodies accepted by the `/api` route handlers. Shared with the client
 * so both sides agree on shapes. Server-side validation is authoritative.
 */
import { z } from "zod"

import { CASE_STATUS_IDS, CURRENCIES, FRAUD_CATEGORY_IDS } from "@/lib/config/taxonomy"
import { CARD_NUMBER_PATTERN, noSecrets } from "@/lib/validation/incident"
import type { CaseStatus, Currency, FraudCategory } from "@/types"

const triState = z.enum(["yes", "no", "unsure"])

const transactionRef = z
  .string()
  .trim()
  .min(4)
  .max(60)
  .refine((v) => !CARD_NUMBER_PATTERN.test(v) || /^\d{12}$/.test(v.replace(/\D/g, "")), "Looks like a card number")
  .refine(noSecrets, "Must not contain PINs, OTPs or passwords")

/** Metadata only — file contents never leave the user's browser. */
export const evidenceMetaSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/plain"]),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 * 1024),
  description: z.string().trim().max(500).optional(),
})

export const createIncidentSchema = z.object({
  category: z.enum(FRAUD_CATEGORY_IDS as [FraudCategory, ...FraudCategory[]]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(2000).refine(noSecrets, "Must not contain PINs, OTPs or passwords"),
  amount: z.number().nonnegative().max(1_000_000_000),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
  occurredAt: z.iso.datetime().refine((v) => new Date(v).getTime() <= Date.now() + 5 * 60_000, "Date can't be in the future"),
  paymentMethod: z.string().trim().min(1).max(60),
  transactionRef: transactionRef.optional(),
  hasAccountAccess: triState,
  ongoing: triState.optional(),
  evidence: z.array(evidenceMetaSchema).max(10).default([]),
})

export const updateIncidentSchema = z
  .object({
    status: z.enum(CASE_STATUS_IDS as [CaseStatus, ...CaseStatus[]]).optional(),
    transactionRef: transactionRef.optional(),
  })
  .refine((v) => v.status !== undefined || v.transactionRef !== undefined, "Nothing to update")

export const noteBodySchema = z.object({
  body: z.string().trim().min(2).max(1000).refine(noSecrets, "Must not contain PINs, OTPs or passwords"),
})

export const addEvidenceSchema = z.object({ files: z.array(evidenceMetaSchema).min(1).max(10) })

export const actionStatusSchema = z.object({ status: z.enum(["pending", "in_progress", "completed"]) })

export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    email: z.email().max(254),
    preferredLanguage: z.string().trim().min(1).max(40),
    city: z.string().trim().max(80),
    phoneHint: z.string().trim().max(30),
  })
  .partial()

export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(500) })

export type CreateIncidentBody = z.infer<typeof createIncidentSchema>
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>
