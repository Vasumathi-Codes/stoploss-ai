import { BadgeCheck, CircleHelp, Globe, Phone } from "lucide-react"

import { ExternalResourceLink } from "@/components/shared/external-resource-link"
import { ToneBadge } from "@/components/shared/status-badges"
import { Card } from "@/components/ui/card"
import { RESOURCE_KIND_LABELS } from "@/lib/config/official-resources"
import { formatDate } from "@/lib/utils/format"
import type { OfficialResource } from "@/types"

export function OfficialResourceCard({ resource }: { resource: OfficialResource }) {
  return (
    <Card className={resource.verification.status === "verified" ? "gap-4 p-5" : "gap-4 border-dashed p-5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">{resource.organization}</p>
          <h3 className="text-base leading-snug font-semibold">{resource.name}</h3>
        </div>
        <ToneBadge tone="neutral">{RESOURCE_KIND_LABELS[resource.kind]}</ToneBadge>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Purpose</dt>
          <dd>{resource.purpose}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">When it may be relevant</dt>
          <dd>{resource.relevance}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Contact</dt>
          <dd className="flex items-center gap-1.5 font-mono text-[13px]">
            {resource.phone ? (
              <>
                <Phone aria-hidden className="size-3.5 text-muted-foreground" />
                {resource.phone}
              </>
            ) : resource.url ? (
              <>
                <Globe aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="break-all">{resource.url.replace(/^https?:\/\//, "")}</span>
              </>
            ) : (
              <span className="font-sans text-muted-foreground">Use your provider&apos;s official channel</span>
            )}
          </dd>
        </div>
        {resource.note && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{resource.note}</p>}
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {resource.verification.status === "verified" ? (
          <ToneBadge tone="success" icon={BadgeCheck}>
            Last verified {formatDate(resource.verification.lastVerified)}
          </ToneBadge>
        ) : (
          <ToneBadge tone="warning" icon={CircleHelp} title="The STOPLOSS AI team has not yet verified this entry.">
            Not yet verified
          </ToneBadge>
        )}
        <ExternalResourceLink resource={resource} variant="secondary" />
      </div>
    </Card>
  )
}
