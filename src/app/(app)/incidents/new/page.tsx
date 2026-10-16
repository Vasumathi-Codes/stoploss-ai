import type { Metadata } from "next"

import { IncidentWizard } from "@/components/incidents/incident-wizard"
import { PageHeader } from "@/components/shared/page-header"

export const metadata: Metadata = { title: "Report a New Fraud" }

export default function NewIncidentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/dashboard", label: "Dashboard" }}
        title="Report a New Fraud"
        description="Take a breath. We'll go step by step, and you can come back to add more later."
      />
      <IncidentWizard />
    </div>
  )
}
