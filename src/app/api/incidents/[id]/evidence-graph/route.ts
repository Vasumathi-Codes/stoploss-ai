import type { NextRequest } from "next/server"

import { currentUserId, uuidParam } from "@/server/api"
import { getEvidenceGraph } from "@/server/evidence-graph"
import { handle } from "@/server/http"

/** The case's evidence graph, built from persisted facts. Never calls an AI model. */
export const GET = handle(async (_request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/evidence-graph">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  return Response.json({ graph: await getEvidenceGraph(userId, id) })
})
