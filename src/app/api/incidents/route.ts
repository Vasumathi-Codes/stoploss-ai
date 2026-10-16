import { createIncidentSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse } from "@/server/api"
import { createIncident } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

/** Creates a case with evidence metadata. Analysis is started separately. */
export const POST = handle(async (request: Request) => {
  const userId = await currentUserId()
  const body = await parseBody(request, createIncidentSchema)
  const created = await createIncident(userId, body)
  return snapshotResponse(userId, created, 201)
})
