import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ProgressIndicatorProps {
  done: number
  total: number
  label?: string
  className?: string
  size?: "sm" | "md"
}

export function ProgressIndicator({ done, total, label = "Response steps", className, size = "md" }: ProgressIndicatorProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{total === 0 ? "Not generated yet" : `${done}/${total} · ${percent}%`}</span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label}: ${done} of ${total} complete`}
        className={cn(size === "md" ? "h-2" : "h-1.5", "[&>[data-slot=progress-indicator]]:bg-primary")}
      />
    </div>
  )
}
