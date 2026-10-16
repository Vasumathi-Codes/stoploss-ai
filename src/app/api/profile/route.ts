import { profilePatchSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse } from "@/server/api"
import { updateProfile } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

export const PATCH = handle(async (request: Request) => {
  const userId = await currentUserId()
  await updateProfile(userId, await parseBody(request, profilePatchSchema))
  return snapshotResponse(userId)
})
