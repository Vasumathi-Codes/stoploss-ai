"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, ArrowRight, BookOpenText, Bot, Clock } from "lucide-react"
import { toast } from "sonner"

import { AGENT_ICONS } from "@/components/agents/agent-card"
import { fieldA11y, FormField } from "@/components/shared/form-field"
import { ActionChecklist } from "@/components/action-plans/action-item"
import { AgentStatusBadge, PriorityBadge, ProvenanceBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePlan } from "@/features/action-plans/hooks"
import { useAgentProvenance, useAgentState } from "@/features/agents/hooks"
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { CASE_STATUSES, FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { caseService } from "@/lib/services"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"
import { transactionRefSchema } from "@/lib/validation/incident"
import type { ActionItem, AgentId, AgentRunState, Incident, TriState } from "@/types"

const TRI: Record<TriState, string> = { yes: "Yes", no: "No", unsure: "Not sure" }

type Tab = "overview" | "analysis" | "actions" | "evidence" | "timeline" | "notes"

export function CaseOverviewTab({
  incident,
  actions,
  evidenceCount,
  onNavigate,
}: {
  incident: Incident
  actions: ActionItem[]
  evidenceCount: number
  onNavigate: (tab: Tab) => void
}) {
  const agents = useAgentState(incident.id)
  const [refOpen, setRefOpen] = useState(false)
  const plan = usePlan(incident.id)
  const topAction = plan.next
  const upcoming = plan.ordered.filter((a) => a.status !== "completed" && a.id !== topAction?.id).slice(0, 3)
  const completedCount = plan.ordered.length - plan.ordered.filter((a) => a.status !== "completed").length

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        {!incident.transactionRef && (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center"
          >
            <AlertTriangle aria-hidden className="size-5 shrink-0 text-warning" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Transaction reference missing</p>
              <p className="text-muted-foreground">
                The UTR / RRN from your bank SMS or payment app helps banks and authorities find the transaction.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setRefOpen(true)}>
              Add reference
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Incident summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm leading-relaxed whitespace-pre-line">{incident.description}</p>
            <DetailGroup title="The incident">
              <Item label="Category" value={FRAUD_CATEGORIES[incident.category].label} />
              <Item
                label="Approximate amount"
                value={<span className="font-semibold tabular-nums">{formatCurrency(incident.amount, incident.currency)}</span>}
              />
              <Item label="When it happened" value={formatDateTime(incident.occurredAt)} />
              <Item label="Payment method / platform" value={incident.paymentMethod} />
              <Item
                label="Transaction reference"
                value={
                  incident.transactionRef ? (
                    <span className="font-mono">{incident.transactionRef}</span>
                  ) : (
                    <span className="text-warning">Not provided</span>
                  )
                }
              />
              <Item label="Still happening" value={incident.ongoing ? TRI[incident.ongoing] : "Not answered"} />
              <Item label="Access to the account" value={TRI[incident.hasAccountAccess]} />
            </DetailGroup>
            <DetailGroup title="This case">
              <Item label="Case reference" value={<span className="font-mono">{incident.reference}</span>} />
              <Item label="Status in app" value={CASE_STATUSES[incident.status].label} />
              <Item label="Evidence items" value={evidenceCount} />
              <Item label="Reported in app" value={formatDateTime(incident.reportedAt)} />
              <Item label="Last updated" value={formatDateTime(incident.updatedAt)} />
            </DetailGroup>
          </CardContent>
        </Card>

        {upcoming.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>After that</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => onNavigate("actions")}>
                Full plan ({completedCount}/{plan.ordered.length} done)
                <ArrowRight aria-hidden />
              </Button>
            </CardHeader>
            <CardContent>
              <ActionChecklist actions={upcoming} numbered={{ start: completedCount + 2 }} compact />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Do this next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topAction ? (
              <>
                <PriorityBadge action={topAction} />
                <p className="leading-snug font-medium">{topAction.title}</p>
                <p className="text-sm text-muted-foreground">{topAction.explanation}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock aria-hidden className="size-3.5" />
                  {topAction.timing}
                </p>
                {topAction.requiredInfo.length > 0 && (
                  <div className="rounded-lg bg-muted/60 p-3 text-xs">
                    <p className="mb-1 font-medium">Have ready</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {topAction.requiredInfo.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button size="sm" onClick={() => onNavigate("actions")}>
                  <BookOpenText aria-hidden />
                  Open in action plan
                </Button>
              </>
            ) : actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No action plan yet. Run the agent analysis to generate one.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                All steps are marked complete. Keep any reference numbers in your notes.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot aria-hidden className="size-4 text-primary" />
              Agent status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {AGENT_ORDER.map((id) => {
                const Icon = AGENT_ICONS[id]
                return <AgentStatusRow key={id} agentId={id} icon={Icon} incidentId={incident.id} state={agents?.[id]} />
              })}
            </ul>
            <Button size="sm" variant="ghost" className="mt-3 -ml-2" onClick={() => onNavigate("analysis")}>
              View agent analysis
              <ArrowRight aria-hidden />
            </Button>
          </CardContent>
        </Card>
      </div>

      <TransactionRefDialog incident={incident} open={refOpen} onOpenChange={setRefOpen} />
    </div>
  )
}

function AgentStatusRow({
  agentId,
  icon: Icon,
  incidentId,
  state,
}: {
  agentId: AgentId
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  incidentId: string
  state?: AgentRunState
}) {
  const provenance = useAgentProvenance(incidentId, agentId)
  const status = state?.status ?? "not_started"
  return (
    <li className="space-y-1.5">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{AGENTS[agentId].name}</span>
      </span>
      <span className="flex flex-wrap gap-1.5 pl-6">
        <AgentStatusBadge status={status} />
        {status !== "analyzing" && <ProvenanceBadge provenance={provenance} />}
      </span>
    </li>
  )
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <dl className="grid gap-x-4 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  )
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  )
}

function TransactionRefDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: Incident
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const form = useForm<{ ref: string }>({ resolver: zodResolver(transactionRefSchema), defaultValues: { ref: "" } })
  const error = form.formState.errors.ref?.message
  const submit = form.handleSubmit(async ({ ref }) => {
    if (!(await caseService.setTransactionRef(incident.id, ref.trim()))) return
    toast.success("Transaction reference added", { description: "The Evidence Agent's checklist has been updated." })
    form.reset()
    onOpenChange(false)
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add transaction reference</DialogTitle>
            <DialogDescription>
              Usually a 12-digit UTR or RRN in your bank SMS or payment-app history. Not your card number.
            </DialogDescription>
          </DialogHeader>
          <FormField id="ref" label="Transaction reference" error={error}>
            <Input {...form.register("ref")} {...fieldA11y("ref", error)} autoComplete="off" placeholder="e.g. 628104779213" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save reference</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
