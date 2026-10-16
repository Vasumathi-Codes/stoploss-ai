import { z } from "zod"

import { CURRENCIES, FRAUD_CATEGORY_IDS } from "@/lib/config/taxonomy"

/** Catches the most common ways people paste secrets into free text. */
const SECRET_PATTERN = /\b(otp|pin|upi\s*pin|password|passcode|cvv|mpin)\b\s*(is|was|:|-|=)?\s*[\w@#$%]{3,}/i
const CARD_NUMBER_PATTERN = /(?:\d[ -]?){13,19}/

const noSecrets = (value: string) => !SECRET_PATTERN.test(value)

export const incidentDetailsSchema = z.object({
  category: z.enum(FRAUD_CATEGORY_IDS as [string, ...string[]], { error: "Choose the type that fits best" }),
  title: z.string().trim().max(80, "Keep the name under 80 characters").optional(),
  description: z
    .string()
    .trim()
    .min(20, "Add a little more detail (at least 20 characters)")
    .max(2000, "Keep it under 2,000 characters")
    .refine(noSecrets, "It looks like this includes a PIN, OTP or password. Please remove it."),
  amount: z
    .string()
    .trim()
    .min(1, "Enter an approximate amount (0 if nothing was lost)")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, "")), "Enter a number, e.g. 18500")
    .refine((v) => Number(v.replace(/,/g, "")) <= 1_000_000_000, "That amount looks too large"),
  currency: z.enum(CURRENCIES as [string, ...string[]]),
  occurredAt: z
    .string()
    .min(1, "Enter an approximate date and time")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time")
    .refine((v) => new Date(v).getTime() <= Date.now() + 5 * 60_000, "The date can't be in the future"),
  paymentMethod: z.string().min(1, "Choose a payment method or platform"),
  transactionRef: z
    .string()
    .trim()
    .max(60, "Keep the reference under 60 characters")
    .refine(
      (v) => !CARD_NUMBER_PATTERN.test(v) || /^\d{12}$/.test(v.replace(/\D/g, "")),
      "This looks like a card number. Don't enter full card numbers.",
    )
    .refine(noSecrets, "Don't include PINs, OTPs or passwords")
    .optional(),
  hasAccountAccess: z.enum(["yes", "no", "unsure"], { error: "Let us know if you can still access the account" }),
  ongoing: z.enum(["yes", "no", "unsure"]).optional(),
  confirmAccurate: z.boolean(),
})

export type IncidentFormValues = z.infer<typeof incidentDetailsSchema>

export const STEP_ONE_FIELDS = [
  "category",
  "title",
  "description",
  "amount",
  "currency",
  "occurredAt",
  "paymentMethod",
  "transactionRef",
  "hasAccountAccess",
  "ongoing",
] as const satisfies readonly (keyof IncidentFormValues)[]

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(2, "Write a short note")
    .max(1000, "Keep notes under 1,000 characters")
    .refine(noSecrets, "Notes shouldn't contain PINs, OTPs or passwords"),
})

export const transactionRefSchema = z.object({
  ref: z
    .string()
    .trim()
    .min(4, "Enter the reference shown in your bank SMS or app")
    .max(60)
    .refine((v) => !CARD_NUMBER_PATTERN.test(v) || /^\d{12}$/.test(v.replace(/\D/g, "")), "This looks like a card number")
    .refine(noSecrets, "Don't include PINs, OTPs or passwords"),
})
