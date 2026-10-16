import type { NextRequest } from "next/server"

import { addEvidenceSchema } from "@/lib/validation/api"
import { currentUserId, snapshotResponse, uuidParam } from "@/server/api"
import { addEvidence } from "@/server/cases"
import { handle, parseBody } from "@/server/http"

/** Records evidence metadata. File contents are never uploaded. */
export const POST = handle(async (request: NextRequest, ctx: RouteContext<"/api/incidents/[id]/evidence">) => {
  const userId = await currentUserId()
  const id = uuidParam((await ctx.params).id, "case")
  const { files } = await parseBody(request, addEvidenceSchema)
  const evidenceIds = await addEvidence(userId, id, files)
  return snapshotResponse(userId, { evidenceIds }, 201)
})
