import type { NextRequest } from "next/server"

import { analyzeBodySchema } from "@/lib/validation/evidence-graph"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { analyzeEvidence } from "@/server/evidence-graph"
import { handle, parseBody } from "@/server/http"
import { takeSlot } from "@/server/rate-limit"

/** Chat exports and statement lines are text; this keeps a request well under typical limits. */
const MAX_BYTES = 400_000
const MAX_PER_HOUR = Number(process.env.EVIDENCE_ANALYSES_PER_HOUR ?? 120)

/**
 * Adds facts from the given sources (re-parsed and screened here) and re-runs deterministic
 * matching. Screenshot sources reference a reading the server already holds, so no image is
 * sent again and no model is called. Responds with the graph and a fresh snapshot.
 */
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/evidence-graph/analyze">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  const { sources } = await parseBody(request, analyzeBodySchema, MAX_BYTES)
  takeSlot("evidence-analyze", userId, MAX_PER_HOUR, "Too many evidence analyses this hour. Try again later.")
  const { graph } = await analyzeEvidence(userId, id, sources)
  return snapshotResponse(userId, { graph })
})
