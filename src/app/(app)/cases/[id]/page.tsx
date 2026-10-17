import { Suspense } from "react"
import type { Metadata } from "next"

import { CaseDetailView } from "@/components/cases/case-detail-view"
import { LoadingState } from "@/components/shared/states"

export const metadata: Metadata = { title: "Case Detail" }

// URL data is read inside Suspense so the page shell can show instantly on navigation.
export default function CaseDetailPage({ params }: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading case…" rows={4} />}>
      <CaseDetail params={params} />
    </Suspense>
  )
}

async function CaseDetail({ params }: Pick<PageProps<"/cases/[id]">, "params">) {
  const { id } = await params
  return <CaseDetailView id={id} />
}
