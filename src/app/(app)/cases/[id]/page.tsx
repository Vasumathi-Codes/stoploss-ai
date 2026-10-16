import type { Metadata } from "next"

import { CaseDetailView } from "@/components/cases/case-detail-view"

export const metadata: Metadata = { title: "Case Detail" }

export default async function CaseDetailPage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params
  return <CaseDetailView id={id} />
}
