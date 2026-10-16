import type { NextRequest } from "next/server"

import { updateIncidentSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { updateIncident } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/incidents/[id]">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  await updateIncident(userId, id, await parseBody(request, updateIncidentSchema))
  return snapshotResponse(userId)
})
