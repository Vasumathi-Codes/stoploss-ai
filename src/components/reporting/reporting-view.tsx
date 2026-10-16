"use client"

import { ClipboardList, Scale, ShieldAlert } from "lucide-react"

import { OfficialResourceCard } from "@/components/reporting/official-resource-card"
import { PageHeader, SectionHeading } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { resourceService } from "@/lib/services"

const PREP = [
  "Transaction date, time, amount and reference (UTR / RRN)",
  "The other party's phone number, UPI ID, account name, profile or link",
  "Screenshots of payments, chats, SMS and call logs",
  "A short timeline of what happened, in your own words",
  "Any complaint or reference numbers you've already received",
]

export function ReportingView() {
  const resources = resourceService.listOfficialResources()
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
            complaints, freeze accounts or guarantee that money will be recovered. These entries have not yet been verified by the
            STOPLOSS AI team — confirm details on the official source before you rely on them.
          </p>
        </div>
      </div>

      <section aria-labelledby="channels" className="space-y-3">
        <SectionHeading id="channels" title="Reporting and support channels" />
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((r) => (
            <li key={r.id} className="grid">
              <OfficialResourceCard resource={r} />
            </li>
          ))}
        </ul>
      </section>

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
