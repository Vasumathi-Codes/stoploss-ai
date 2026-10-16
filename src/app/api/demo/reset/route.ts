import { currentUserId, snapshotResponse } from "@/server/api"
import { prisma } from "@/server/db"
import { HttpError, handle } from "@/server/http"
import { resetDemoData } from "@/server/seed"

/**
 * Deletes the demo user's cases and restores the sample data. Disabled in
 * production unless ALLOW_DEMO_RESET=true.
 */
export const POST = handle(async () => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_RESET !== "true") {
    throw new HttpError(403, "Demo reset is disabled in production")
  }
  await currentUserId()
  const user = await prisma.$transaction((tx) => resetDemoData(tx), { timeout: 30_000 })
  return snapshotResponse(user.id)
})
