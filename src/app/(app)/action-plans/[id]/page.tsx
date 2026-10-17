import { Suspense } from "react"
import type { Metadata } from "next"

import { ActionPlanDetailView } from "@/components/action-plans/action-plan-detail-view"
import { LoadingState } from "@/components/shared/states"

export const metadata: Metadata = { title: "Action Plan" }

// URL data is read inside Suspense so the page shell can show instantly on navigation.
export default function ActionPlanPage({ params }: PageProps<"/action-plans/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading action plan…" rows={4} />}>
      <ActionPlan params={params} />
    </Suspense>
  )
}

async function ActionPlan({ params }: Pick<PageProps<"/action-plans/[id]">, "params">) {
  const { id } = await params
  return <ActionPlanDetailView id={id} />
}
