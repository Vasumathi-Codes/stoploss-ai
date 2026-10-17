import type { Metadata } from "next"
import { Suspense } from "react"

import { EvidenceVaultView } from "@/components/evidence/evidence-vault-view"
import { LoadingState } from "@/components/shared/states"

export const metadata: Metadata = { title: "Evidence Vault" }

export default function EvidencePage() {
  // The view reads `?case=` to pre-filter, so it renders inside Suspense.
  return (
    <Suspense fallback={<LoadingState label="Loading evidence…" />}>
      <EvidenceVaultView />
    </Suspense>
  )
}
