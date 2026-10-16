import type { Metadata } from "next"

import { ActionPlanDetailView } from "@/components/action-plans/action-plan-detail-view"

export const metadata: Metadata = { title: "Action Plan" }

export default async function ActionPlanPage({ params }: PageProps<"/action-plans/[id]">) {
  const { id } = await params
  return <ActionPlanDetailView id={id} />
}
