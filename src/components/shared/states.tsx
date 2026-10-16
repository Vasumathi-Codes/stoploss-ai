import { AlertOctagon, Inbox, Loader2, type LucideIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface StateProps {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: LucideIcon
  className?: string
}

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ title, description, action, icon: Icon = AlertOctagon, className }: StateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <Icon aria-hidden className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingState({ label = "Loading…", rows = 3, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        {label}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  )
}
