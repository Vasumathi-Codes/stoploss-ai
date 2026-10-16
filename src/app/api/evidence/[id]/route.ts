import type { NextRequest } from "next/server"

import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { removeEvidence } from "@/server/cases"
import { handle } from "@/server/http"

export const DELETE = handle(async (_request: NextRequest, ctx: RouteContext<"/api/evidence/[id]">) => {
  const userId = await currentUserId()
  await removeEvidence(userId, uuidParam((await ctx.params).id, "evidence item"))
  return snapshotResponse(userId)
})
