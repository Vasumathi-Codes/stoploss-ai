/**
 * Sliding-window limit per user and bucket. In-memory, per process: enough for the single-user
 * demo (the same approach as the screenshot limit in /api/extract).
 */
import { HttpError } from "@/server/errors"

const globalForLimits = globalThis as unknown as { rateLimits?: Map<string, number[]> }
const hits = (globalForLimits.rateLimits ??= new Map<string, number[]>())

export function takeSlot(bucket: string, userId: string, max: number, message: string, windowMs = 3_600_000, now = Date.now()) {
  const key = `${bucket}:${userId}`
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
  if (recent.length >= max) throw new HttpError(429, message)
  recent.push(now)
  hits.set(key, recent)
}
