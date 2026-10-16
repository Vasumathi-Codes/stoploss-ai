import { FindingSourceBadge, ToneBadge } from "@/components/shared/status-badges"
import type { AgentFinding } from "@/types"

export function FindingsList({ findings, emptyMessage }: { findings: AgentFinding[]; emptyMessage: string }) {
  if (findings.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <li key={f.id} className="rounded-lg border bg-background/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-medium">{f.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {f.confidence && (
                <ToneBadge tone="muted" title="A rough label for the demo, not a statistical measure.">
                  Confidence: {f.confidence}
                </ToneBadge>
              )}
              <FindingSourceBadge source={f.source} />
            </div>
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{f.detail}</p>
          {f.items && f.items.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {f.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
