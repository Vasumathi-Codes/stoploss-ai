import { currentUserId } from "@/server/api"
import { getSnapshot } from "@/server/cases"
import { handle } from "@/server/http"

export const GET = handle(async () => {
  const userId = await currentUserId()
  return Response.json(await getSnapshot(userId), { headers: { "Cache-Control": "no-store" } })
})
