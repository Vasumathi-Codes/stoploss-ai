import { connection } from "next/server"

import { prisma } from "@/server/db"

export async function GET() {
  await connection()
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: "ok", database: "up" })
  } catch {
    return Response.json({ status: "degraded", database: "down" }, { status: 503 })
  }
}
