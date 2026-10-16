import type { Metadata } from "next"

import { ActionPlansView } from "@/components/action-plans/action-plans-view"

export const metadata: Metadata = { title: "Action Plans" }

export default function ActionPlansPage() {
  return <ActionPlansView />
}
