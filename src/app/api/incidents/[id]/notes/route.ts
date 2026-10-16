import type { NextRequest } from "next/server"

import { noteBodySchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { addNote } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/notes">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  const { body } = await parseBody(request, noteBodySchema)
  await addNote(userId, id, body)
  return snapshotResponse(userId, undefined, 201)
})
