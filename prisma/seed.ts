import "dotenv/config"

import { createPrismaClient } from "@/server/db"
import { resetDemoData } from "@/server/seed"

async function main() {
  const prisma = createPrismaClient()
  try {
    const user = await prisma.$transaction((tx) => resetDemoData(tx), { timeout: 30_000 })
    const cases = await prisma.incident.count({ where: { userId: user.id } })
    const resources = await prisma.officialResource.count()
    console.log(`Seeded ${cases} sample cases and ${resources} official resources for ${user.email}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
