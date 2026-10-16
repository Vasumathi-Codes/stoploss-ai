import type { Metadata } from "next"
import { Suspense } from "react"

import { AgentsView } from "@/components/agents/agents-view"
import { LoadingState } from "@/components/shared/states"

export const metadata: Metadata = { title: "AI Emergency Team" }

export default function AgentsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading agents…" />}>
      <AgentsView />
    </Suspense>
  )
}
