import type { NextRequest } from "next/server"

import { actionStatusSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { setActionStatus } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

export const PATCH = handle(async (request: NextRequest, ctx: RouteContext<"/api/actions/[id]">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "action")
  const { status } = await parseBody(request, actionStatusSchema)
  await setActionStatus(userId, id, status)
  return snapshotResponse(userId)
})
