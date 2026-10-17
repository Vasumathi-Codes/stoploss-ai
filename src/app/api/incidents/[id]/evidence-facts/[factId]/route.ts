import type { NextRequest } from "next/server"

import { factReviewSchema } from "@/lib/validation/evidence-graph"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { reviewFact } from "@/server/evidence-graph"
import { handle, parseBody } from "@/server/http"

/** Confirm, reject, correct or flag a fact, or mark a conflict it is part of as reviewed / deferred. */
export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/evidence-facts/[factId]">) => {
  const userId = await currentUserId()
  const params = await ctx.params
  const id = uuidParam(params.id, "case")
  const factId = uuidParam(params.factId, "fact")
  const graph = await reviewFact(userId, id, factId, await parseBody(request, factReviewSchema, 10_000))
  return snapshotResponse(userId, { graph })
})
