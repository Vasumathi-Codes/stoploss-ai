import type { Metadata } from "next"

import { EvidenceVaultView } from "@/components/evidence/evidence-vault-view"

export const metadata: Metadata = { title: "Evidence Vault" }

export default function EvidencePage() {
  return <EvidenceVaultView />
}
