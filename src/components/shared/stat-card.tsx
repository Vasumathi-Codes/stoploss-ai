import type { LucideIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TONE_ICON, type Tone } from "@/lib/utils/tone"

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  tone?: Tone
  className?: string
}

export function StatCard({ label, value, hint, icon: Icon, tone = "primary", className }: StatCardProps) {
  return (
    <Card className={cn("gap-3 p-4 md:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE_ICON[tone])}>
          <Icon aria-hidden className="size-4.5" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}
