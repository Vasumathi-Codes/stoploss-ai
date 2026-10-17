import "server-only"

import { randomUUID } from "node:crypto"

import type { ScreenshotReading } from "@/types"

/**
 * Screenshot Reader results waiting for the person to decide whether to keep them.
 *
 * `POST /api/extract` (with an evidence id) stores the server-validated reading here and
 * returns only an id. Saving it to Evidence Intelligence then references that id, so the
 * stored facts are exactly what the server read — the client can't substitute values, and
 * the image is never sent twice. Nothing here is written to disk; entries expire.
 *
 * In-memory and per process, like the screenshot rate limit: enough for the single-user demo.
 * Across several instances, a reading made on one couldn't be saved on another (the person
 * would be asked to read again).
 */
const TTL_MS = 30 * 60_000
const MAX_PER_USER = 50

interface PendingReading {
  userId: string
  evidenceId: string
  reading: ScreenshotReading
  /** Model deployment and prompt version, kept with the facts. */
  extractorVersion: string
  expiresAt: number
}

const globalForReadings = globalThis as unknown as { pendingReadings?: Map<string, PendingReading> }
const pending = (globalForReadings.pendingReadings ??= new Map<string, PendingReading>())

function prune(now: number) {
  for (const [id, r] of pending) if (r.expiresAt <= now) pending.delete(id)
}

export function rememberReading(userId: string, evidenceId: string, reading: ScreenshotReading, extractorVersion: string) {
  const now = Date.now()
  prune(now)
  const mine = [...pending.entries()].filter(([, r]) => r.userId === userId)
  // Oldest first (Map keeps insertion order).
  for (const [id] of mine.slice(0, Math.max(0, mine.length - MAX_PER_USER + 1))) pending.delete(id)
  const id = randomUUID()
  pending.set(id, { userId, evidenceId, reading, extractorVersion, expiresAt: now + TTL_MS })
  return id
}

/** The reading, if it exists, hasn't expired, and belongs to this user and evidence item. Reusable until it expires. */
export function findReading(userId: string, evidenceId: string, readingId: string) {
  prune(Date.now())
  const r = pending.get(readingId)
  return r && r.userId === userId && r.evidenceId === evidenceId ? r : undefined
}
