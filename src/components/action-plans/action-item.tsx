"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, BookOpenText, Building2, Check, Clock, Link2, Play, RotateCcw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { ExternalResourceLink } from "@/components/shared/external-resource-link"
import { PriorityBadge, ToneBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useActions } from "@/features/action-plans/hooks"
import { useOfficialResource } from "@/features/resources/hooks"
import { actionPlanService } from "@/lib/services"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/utils/format"
import type { ActionItem as ActionItemType, Incident } from "@/types"

interface ActionItemProps {
  action: ActionItemType
  incident?: Incident
  compact?: boolean
  /** Position in the case's suggested order, shown as a step number. */
  stepNumber?: number
  /** The case's next step: gets the primary action. */
  highlight?: boolean
}

export function OriginBadge({ origin }: { origin: ActionItemType["origin"] }) {
  return origin === "external" ? (
    <ToneBadge tone="info" icon={Building2} title="Happens outside STOPLOSS AI. The app cannot verify it.">
      External process
    </ToneBadge>
  ) : (
    <ToneBadge tone="primary" icon={Sparkles} title="Suggested by STOPLOSS AI's configured guidance.">
      Suggested step
    </ToneBadge>
  )
}

export function ActionItem({ action, incident, compact, stepNumber, highlight }: ActionItemProps) {
  const siblings = useActions(action.incidentId)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const resource = useOfficialResource(action.resourceId)
  const done = action.status === "completed"
  const prerequisites = (action.dependsOn ?? [])
    .map((key) => siblings.find((s) => s.key === key))
    .filter((s): s is ActionItemType => Boolean(s))
  const openPrereqs = prerequisites.filter((p) => p.status !== "completed")

  const complete = async () => {
    if (!(await actionPlanService.setStatus(action.id, "completed"))) return
    toast.success("Marked as complete", {
      description: action.title,
      action: { label: "Undo", onClick: () => void actionPlanService.setStatus(action.id, action.status) },
    })
  }
  const requestComplete = () => (action.origin === "external" ? setConfirmOpen(true) : complete())

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-4 transition-colors",
        done && "bg-card/50",
        (highlight || action.status === "in_progress") && !done && "border-primary/40 bg-primary/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => (done ? actionPlanService.setStatus(action.id, "pending") : requestComplete())}
          aria-label={done ? `Reopen: ${action.title}` : `Mark complete: ${action.title}`}
          aria-pressed={done}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
            done ? "border-success bg-success text-background" : "border-muted-foreground/40 hover:border-primary",
          )}
        >
          {done && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p
              className={cn(
                "leading-snug font-medium",
                done && "text-muted-foreground line-through decoration-muted-foreground/40",
              )}
            >
              {stepNumber !== undefined && (
                <span className="mr-1.5 font-mono text-xs font-semibold text-muted-foreground tabular-nums">
                  {String(stepNumber).padStart(2, "0")}
                </span>
              )}
              {action.title}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {highlight && !done && (
                <ToneBadge tone="primary" icon={ArrowRight}>
                  Next step
                </ToneBadge>
              )}
              {action.status === "in_progress" && (
                <ToneBadge tone="primary" icon={Play}>
                  In progress
                </ToneBadge>
              )}
              <PriorityBadge action={action} />
            </div>
          </div>
          {!compact && <p className="text-sm text-muted-foreground">{action.explanation}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3.5" />
              {done && action.completedAt ? `Completed ${formatDateTime(action.completedAt)}` : action.timing}
            </span>
            {!compact && <OriginBadge origin={action.origin} />}
            {incident && (
              <Link
                href={`/cases/${incident.id}`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Link2 aria-hidden className="size-3.5" />
                {incident.reference}
              </Link>
            )}
          </div>
          {!done && openPrereqs.length > 0 && (
            <p className="text-xs text-warning">Recommended after: {openPrereqs.map((p) => p.title).join("; ")}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {!done ? (
              <Button size="sm" variant={highlight ? "default" : "outline"} onClick={requestComplete}>
                <Check aria-hidden />
                Mark complete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  actionPlanService.setStatus(action.id, "pending")
                  toast("Task reopened", { description: action.title })
                }}
              >
                <RotateCcw aria-hidden />
                Reopen
              </Button>
            )}
            {action.status === "pending" && (
              <Button size="sm" variant="ghost" onClick={() => actionPlanService.setStatus(action.id, "in_progress")}>
                <Play aria-hidden />
                Start
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDetailsOpen(true)}>
              <BookOpenText aria-hidden />
              Instructions
            </Button>
            {resource && (
              <ExternalResourceLink
                resource={resource}
                variant="ghost"
                label={resource.phone ? `Call ${resource.phone}` : "Official resource"}
              />
            )}
          </div>
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              <PriorityBadge action={action} />
              <OriginBadge origin={action.origin} />
            </div>
            <DialogTitle className="pt-1 leading-snug">{action.title}</DialogTitle>
            <DialogDescription>{action.explanation}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 font-medium">Recommended timing</p>
              <p className="text-muted-foreground">{action.timing}</p>
            </div>
            <div>
              <p className="mb-1.5 font-medium">How to do it</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                {action.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            {action.requiredInfo.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">Information you may need</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {action.requiredInfo.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {prerequisites.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">Works best after</p>
                <ul className="space-y-1 text-muted-foreground">
                  {prerequisites.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      {p.status === "completed" ? (
                        <Check aria-hidden className="size-3.5 text-success" />
                      ) : (
                        <Clock aria-hidden className="size-3.5" />
                      )}
                      {p.title}
                      <span className="sr-only">{p.status === "completed" ? "(done)" : "(not done)"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {action.origin === "external"
                ? "This step happens outside STOPLOSS AI. The app cannot see or verify whether it was done — only you can mark it complete."
                : "This is general guidance, not legal or financial advice. Adapt it to your situation."}{" "}
              Last updated {formatDateTime(action.updatedAt)}.
            </p>
          </div>
          <DialogFooter>
            {resource && (
              <ExternalResourceLink
                resource={resource}
                label={resource.phone ? `Call ${resource.phone}` : "Open official resource"}
              />
            )}
            {!done && (
              <Button
                onClick={() => {
                  setDetailsOpen(false)
                  requestComplete()
                }}
              >
                <Check aria-hidden />
                Mark complete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Mark this external step as complete?"
        description={
          <>
            <p>
              <span className="font-medium text-foreground">{action.title}</span>
            </p>
            <p>
              Only confirm if you have done this yourself. STOPLOSS AI cannot check with your bank or any authority, so this is
              recorded as your own update.
            </p>
          </>
        }
        confirmLabel="Yes, I've done this"
        onConfirm={complete}
      />
    </div>
  )
}

export function ActionChecklist({
  actions,
  incidents,
  compact,
  numbered,
  nextId,
  emptyMessage = "No actions yet.",
}: {
  actions: ActionItemType[]
  incidents?: Incident[]
  compact?: boolean
  /** Show step numbers (pass actions in plan order). */
  numbered?: boolean | { start: number }
  /** Id of the case's next step, which is highlighted. */
  nextId?: string
  emptyMessage?: string
}) {
  if (actions.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
  const byId = incidents ? new Map(incidents.map((i) => [i.id, i])) : undefined
  const start = typeof numbered === "object" ? numbered.start : 1
  return (
    <ol className="space-y-3">
      {actions.map((a, i) => (
        <li key={a.id}>
          <ActionItem
            action={a}
            incident={byId?.get(a.incidentId)}
            compact={compact}
            stepNumber={numbered ? start + i : undefined}
            highlight={a.id === nextId}
          />
        </li>
      ))}
    </ol>
  )
}
