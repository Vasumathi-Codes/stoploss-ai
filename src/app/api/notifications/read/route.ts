import { markReadSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse } from "@/server/api"
import { markEventsRead } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

export const POST = handle(async (request: Request) => {
  const userId = await currentUserId()
  const { ids } = await parseBody(request, markReadSchema)
  await markEventsRead(userId, ids)
  return snapshotResponse(userId)
})
