"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, ArrowRight, Bot } from "lucide-react"
import { toast } from "sonner"

import { AGENT_ICONS } from "@/components/agents/agent-card"
import { fieldA11y, FormField } from "@/components/shared/form-field"
import { AgentStatusBadge, PriorityBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAgentState } from "@/features/agents/hooks"
import { AGENT_ORDER, AGENTS } from "@/lib/config/agents"
import { CASE_STATUSES, FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { caseService } from "@/lib/services"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"
import { transactionRefSchema } from "@/lib/validation/incident"
import type { ActionItem, Incident, TriState } from "@/types"

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
  const topAction = actions.find((a) => a.status !== "completed")

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
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
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Item label="Case reference" value={<span className="font-mono">{incident.reference}</span>} />
              <Item label="Incident category" value={FRAUD_CATEGORIES[incident.category].label} />
              <Item
                label="Approximate amount reported"
                value={<span className="font-semibold tabular-nums">{formatCurrency(incident.amount, incident.currency)}</span>}
              />
              <Item label="Incident date and time" value={formatDateTime(incident.occurredAt)} />
              <Item label="Reported in app" value={formatDateTime(incident.reportedAt)} />
              <Item label="Current status" value={CASE_STATUSES[incident.status].label} />
              <Item label="Payment method / platform" value={incident.paymentMethod} />
              <Item
                label="Transaction reference"
                value={incident.transactionRef ?? <span className="text-muted-foreground">Not provided</span>}
              />
              <Item label="Account access" value={TRI[incident.hasAccountAccess]} />
              <Item label="Still happening" value={incident.ongoing ? TRI[incident.ongoing] : "Not answered"} />
              <Item label="Evidence items" value={evidenceCount} />
              <Item label="Last updated" value={formatDateTime(incident.updatedAt)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Current recommended priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topAction ? (
              <>
                <PriorityBadge action={topAction} />
                <p className="leading-snug font-medium">{topAction.title}</p>
                <p className="text-sm text-muted-foreground">{topAction.explanation}</p>
                <Button size="sm" variant="secondary" onClick={() => onNavigate("actions")}>
                  Go to action plan
                  <ArrowRight aria-hidden />
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
                return (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{AGENTS[id].name}</span>
                    </span>
                    <AgentStatusBadge status={agents?.[id].status ?? "not_started"} />
                  </li>
                )
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
