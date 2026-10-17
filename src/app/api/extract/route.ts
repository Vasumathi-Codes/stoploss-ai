import { z } from "zod"

import { currentUserId } from "@/server/api"
import { describeFoundryError, getFoundryConfig } from "@/server/foundry/client"
import { extractPaymentDetails } from "@/server/foundry/extract"
import { handle, HttpError, parseBody } from "@/server/http"

/**
 * Reads payment details from one screenshot the person chose to share.
 * The image is held in memory for this request only: it is not saved, logged or
 * kept by Foundry. The response contains only the extracted fields.
 */

/** ~4.5 MB image. The client downscales screenshots well below this. */
const MAX_BASE64_LENGTH = 6_000_000
const MAX_READS_PER_HOUR = Number(process.env.SCREENSHOT_MAX_READS_PER_HOUR ?? 30)

const bodySchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg"]),
  base64: z
    .string()
    .min(100, "Image is empty")
    .max(MAX_BASE64_LENGTH, "Image is too large")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Image must be base64"),
})

// In-memory, per process: enough for the single-user demo.
const globalForReads = globalThis as unknown as { screenshotReads?: Map<string, number[]> }
const reads = (globalForReads.screenshotReads ??= new Map<string, number[]>())

function takeReadSlot(userId: string) {
  const hourAgo = Date.now() - 3_600_000
  const recent = (reads.get(userId) ?? []).filter((t) => t > hourAgo)
  if (recent.length >= MAX_READS_PER_HOUR) throw new HttpError(429, "Too many screenshots read this hour. Try again later.")
  recent.push(Date.now())
  reads.set(userId, recent)
}

export const POST = handle(async (request: Request) => {
  const config = getFoundryConfig()
  if (!config) throw new HttpError(503, "Screenshot reading needs Microsoft Foundry, which isn't configured.")
  const userId = await currentUserId()
  const image = await parseBody(request, bodySchema)
  takeReadSlot(userId)

  try {
    const result = await extractPaymentDetails(config, image)
    return Response.json({ result, model: config.deployment })
  } catch (error) {
    const failure = describeFoundryError(error)
    console.warn(`[foundry] extract failed: ${failure.message}`)
    const status = failure.kind === "rate_limited" ? 429 : failure.kind === "content_filter" ? 422 : 502
    throw new HttpError(status, `Couldn't read the screenshot: ${failure.message}.`)
  }
})
