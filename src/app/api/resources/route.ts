import { connection } from "next/server"

import { prisma } from "@/server/db"
import { handle } from "@/server/http"
import { toResource } from "@/server/mappers"

export const GET = handle(async () => {
  await connection()
  const rows = await prisma.officialResource.findMany({ orderBy: { createdAt: "asc" } })
  return Response.json(rows.map(toResource))
})
