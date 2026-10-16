import Link from "next/link"
import { ArrowUpRight, CalendarClock, RefreshCw } from "lucide-react"

import { CaseStatusBadge, DemoDataBadge } from "@/components/shared/status-badges"
import { ProgressIndicator } from "@/components/shared/progress-indicator"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { cn } from "@/lib/utils"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format"
import type { Incident } from "@/types"

interface IncidentCardProps {
  incident: Incident
  progress: { done: number; total: number }
  layout?: "grid" | "list"
}

export function IncidentCard({ incident, progress, layout = "grid" }: IncidentCardProps) {
  const category = FRAUD_CATEGORIES[incident.category]
  if (layout === "list") {
    return (
      <Link
        href={`/cases/${incident.id}`}
        className="group grid gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">{incident.reference}</p>
          <p className="truncate font-medium group-hover:underline">{incident.title}</p>
          <p className="text-xs text-muted-foreground">{category.short}</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold tabular-nums">{formatCurrency(incident.amount, incident.currency)}</p>
          <p className="text-xs text-muted-foreground">Reported {formatDate(incident.reportedAt)}</p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <CaseStatusBadge status={incident.status} />
          <p className="text-xs text-muted-foreground">Updated {formatDate(incident.updatedAt)}</p>
        </div>
        <ProgressIndicator done={progress.done} total={progress.total} size="sm" />
      </Link>
    )
  }

  return (
    <Link
      href={`/cases/${incident.id}`}
      className={cn("group flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">{incident.reference}</p>
          <p className="mt-0.5 line-clamp-2 font-medium group-hover:underline">{incident.title}</p>
        </div>
        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CaseStatusBadge status={incident.status} />
        <span className="text-xs text-muted-foreground">{category.short}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Amount reported</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(incident.amount, incident.currency)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock aria-hidden className="size-3" />
            Reported
          </dt>
          <dd>{formatDate(incident.reportedAt)}</dd>
        </div>
      </dl>
      <ProgressIndicator done={progress.done} total={progress.total} size="sm" />
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <RefreshCw aria-hidden className="size-3" />
          Updated {formatDateTime(incident.updatedAt)}
        </span>
        {incident.isSample && <DemoDataBadge label="Sample" className="h-5" />}
      </div>
    </Link>
  )
}
