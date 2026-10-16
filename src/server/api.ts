/** Helpers shared by the `/api` route handlers. */
import { connection } from "next/server"
import { z } from "zod"

import { getSnapshot } from "@/server/cases"
import { getCurrentUser } from "@/server/context"
import { HttpError } from "@/server/http"

/** Resolves the acting user. Also opts the request out of prerendering. */
export async function currentUserId() {
  await connection()
  const user = await getCurrentUser()
  return user.id
}

export function uuidParam(value: string, what = "id") {
  const result = z.uuid().safeParse(value)
  if (!result.success) throw new HttpError(404, `Unknown ${what}`)
  return result.data
}

/** Mutations respond with the full, fresh snapshot so the client never drifts. */
export async function snapshotResponse(userId: string, extra?: Record<string, unknown>, status = 200) {
  return Response.json({ ...extra, snapshot: await getSnapshot(userId) }, { status })
}
