"use client"

import { useState } from "react"
import { Loader2, Play, RotateCw } from "lucide-react"
import { toast } from "sonner"

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { useAgentState, useAnalysisEngine } from "@/features/agents/hooks"
import { agentService } from "@/lib/services"
import { useUiPreferences } from "@/lib/store/ui-preferences"
import type { Incident } from "@/types"

type ButtonProps = React.ComponentProps<typeof Button>

/**
 * Starts or reruns the agent analysis (Foundry or simulated) for one case. A rerun replaces agent
 * findings (your completed tasks, notes and evidence are kept).
 */
export function RunAnalysisButton({
  incident,
  size = "sm",
  variant,
}: {
  incident: Incident
  size?: ButtonProps["size"]
  variant?: ButtonProps["variant"]
}) {
  const state = useAgentState(incident.id)
  const notify = useUiPreferences((s) => s.notifyAgentUpdates)
  // Wording follows the engine a new run will use, not the case's previous run.
  const { copy } = useAnalysisEngine()
  const [confirm, setConfirm] = useState(false)
  const running = state ? Object.values(state).some((a) => a.status === "analyzing") : false
  const hasRun = state ? Object.values(state).some((a) => a.status !== "not_started") : false

  const run = async () => {
    if (notify) toast.info(copy.started, { description: `${incident.reference} · ${copy.startedDetail}` })
    const finished = await agentService.runAnalysis(incident.id)
    if (finished && notify) toast.success(copy.finished, { description: `${incident.reference} is ready for your review` })
  }

  if (running) {
    return (
      <Button size={size} variant={variant ?? "secondary"} disabled>
        <Loader2 aria-hidden className="motion-safe:animate-spin" />
        {copy.running}
      </Button>
    )
  }

  return (
    <>
      <Button
        size={size}
        variant={variant ?? (hasRun ? "outline" : "default")}
        onClick={() => (hasRun ? setConfirm(true) : void run())}
      >
        {hasRun ? <RotateCw aria-hidden /> : <Play aria-hidden />}
        {hasRun ? copy.rerun : copy.run}
      </Button>
      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={copy.rerunTitle}
        description={
          <>
            <p>All four agents will run again on {incident.reference} using the case&apos;s current details and evidence.</p>
            <p>Existing agent findings are replaced. Your task progress, notes and evidence are kept.</p>
          </>
        }
        confirmLabel="Rerun"
        onConfirm={() => void run()}
      />
    </>
  )
}
