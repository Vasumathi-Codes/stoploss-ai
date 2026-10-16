import type { NextRequest } from "next/server"

import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { removeNote } from "@/server/cases"
import { handle } from "@/server/http"

export const DELETE = handle(async (_request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/notes/[noteId]">) => {
  const userId = await currentUserId()
  const params = await ctx.params
  await removeNote(userId, uuidParam(params.id, "case"), uuidParam(params.noteId, "note"))
  return snapshotResponse(userId)
})
