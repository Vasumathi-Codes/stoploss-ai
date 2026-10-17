"use client"

import { ClipboardList, Scale, ShieldAlert } from "lucide-react"

import { OfficialResourceCard } from "@/components/reporting/official-resource-card"
import { PageHeader, SectionHeading } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { useOfficialResources } from "@/features/resources/hooks"
import type { OfficialResource } from "@/types"

const PREP = [
  "Transaction date, time, amount and reference (UTR / RRN)",
  "The other party's phone number, UPI ID, account name, profile or link",
  "Screenshots of payments, chats, SMS and call logs",
  "A short timeline of what happened, in your own words",
  "Any complaint or reference numbers you've already received",
]

function ResourceGroup({
  id,
  title,
  description,
  resources,
}: {
  id: string
  title: string
  description: string
  resources: OfficialResource[]
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionHeading id={id} title={title} description={description} />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {resources.map((r) => (
          <li key={r.id} className="grid">
            <OfficialResourceCard resource={r} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ReportingView() {
  const resources = useOfficialResources()
  const verified = resources.filter((r) => r.verification.status === "verified")
  const unverified = resources.filter((r) => r.verification.status !== "verified")
  return (
    <div className="space-y-8">
      <PageHeader
        title="Official Reporting"
        description="Channels that may be relevant for digital payment fraud in India. Contact them directly — STOPLOSS AI can't do it for you."
      />

      <div role="note" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
        <Scale aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
        <div className="space-y-1">
          <p className="font-medium">STOPLOSS AI is an independent guidance tool.</p>
          <p className="text-muted-foreground">
            It does not represent any bank, payment provider, government agency or law-enforcement body, and cannot file
            complaints, freeze accounts or guarantee that money will be recovered.{" "}
            {verified.length === 0
              ? "None of these entries have been verified by the STOPLOSS AI team yet — confirm details on the official source before you rely on them."
              : `${verified.length} of ${resources.length} entries have been verified by the STOPLOSS AI team. Confirm the others on the official source before you rely on them.`}
          </p>
        </div>
      </div>

      {verified.length > 0 && (
        <ResourceGroup
          id="verified"
          title={`Verified channels (${verified.length})`}
          description="Checked against the official source by the STOPLOSS AI team on the date shown."
          resources={verified}
        />
      )}
      {unverified.length > 0 && (
        <ResourceGroup
          id="unverified"
          title={`Needs verification (${unverified.length})`}
          description="Listed for convenience but not yet checked by the STOPLOSS AI team. Confirm the address or number on the organisation's own website, card or app before using it."
          resources={unverified}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ClipboardList aria-hidden className="size-4.5 text-primary" />
            Have these ready before you call or file
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {PREP.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
        <Card className="gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldAlert aria-hidden className="size-4.5 text-warning" />
            Stay safe while reporting
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Type official addresses yourself or use the links here — don&apos;t trust links from calls, SMS or search ads.
            </li>
            <li>No official body will ask for your OTP, UPI PIN, CVV or passwords.</li>
            <li>Be wary of anyone who contacts you offering to recover money for a fee.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
