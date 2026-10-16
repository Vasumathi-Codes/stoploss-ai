import { after, type NextRequest } from "next/server"

import { startAnalysis } from "@/server/analysis"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { assertOwnsIncident } from "@/server/cases"
import { handle } from "@/server/http"

/**
 * Starts (or restarts) the simulated agent analysis. Responds immediately with
 * 202; the agents run after the response and the client polls `/api/state`.
 */
export const POST = handle(async (_request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/analysis">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  await assertOwnsIncident(userId, id)
  const run = await startAnalysis(id)
  after(run)
  return snapshotResponse(userId, undefined, 202)
})
