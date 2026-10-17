import { z } from "zod"

import { currentUserId } from "@/server/api"
import { describeFoundryError, getFoundryConfig } from "@/server/foundry/client"
import { assertOwnsEvidence, markProcessingFailed } from "@/server/evidence-graph"
import { EXTRACT_PROMPT_VERSION, extractPaymentDetails } from "@/server/foundry/extract"
import { handle, HttpError, parseBody } from "@/server/http"
import { rememberReading } from "@/server/screenshot-readings"

/**
 * Reads payment details from one screenshot the person chose to share.
 * The image is held in memory for this request only: it is not saved, logged or
 * kept by Foundry. The response contains only the extracted fields.
 *
 * With an `evidenceId` (a case's evidence item), the validated result is also held
 * briefly server-side under a `readingId`, so the person can save it to Evidence
 * Intelligence without the image being sent again or the values coming from the client.
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
  evidenceId: z.uuid().optional(),
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
  const { evidenceId, ...image } = await parseBody(request, bodySchema, MAX_BASE64_LENGTH + 1_000)
  if (evidenceId) await assertOwnsEvidence(userId, evidenceId, "image")
  takeReadSlot(userId)

  try {
    const result = await extractPaymentDetails(config, image)
    const readingId = evidenceId
      ? rememberReading(userId, evidenceId, result, `${config.deployment} · prompt ${EXTRACT_PROMPT_VERSION}`)
      : undefined
    return Response.json({ result, model: config.deployment, readingId })
  } catch (error) {
    const failure = describeFoundryError(error)
    console.warn(`[foundry] extract failed: ${failure.message}`)
    if (evidenceId) await markProcessingFailed(userId, evidenceId, `Reading failed: ${failure.message}. You can try again.`)
    const status = failure.kind === "rate_limited" ? 429 : failure.kind === "content_filter" ? 422 : 502
    throw new HttpError(status, `Couldn't read the screenshot: ${failure.message}.`)
  }
})
