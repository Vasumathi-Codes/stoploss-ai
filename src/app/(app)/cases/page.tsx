import type { Metadata } from "next"

import { CasesView } from "@/components/cases/cases-view"

export const metadata: Metadata = { title: "My Cases" }

export default function CasesPage() {
  return <CasesView />
}
