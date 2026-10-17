"use client"

import { useState } from "react"
import { Eye, ListFilter, RotateCcw, ScanText, TextSearch, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EvidencePreviewDialog } from "@/components/evidence/evidence-preview-dialog"
import { ScreenshotReaderDialog } from "@/components/evidence/screenshot-reader-dialog"
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { READABLE_IMAGE_TYPES } from "@/lib/images/prepare-screenshot"
import { SOURCE_TYPE_LABELS } from "@/lib/evidence/labels"
import type { EvidenceGraph, EvidenceNode } from "@/lib/evidence/types"
import { evidenceGraphService, evidenceService } from "@/lib/services"
import { cn } from "@/lib/utils"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceItem, Incident } from "@/types"

import { ExtractFactsDialog, type KnownValues } from "./extract-facts-dialog"
import { EvidenceIcon, ProcessingBadge } from "./meta"

/** One evidence source: what it is, whether it has been analysed, and what can be done with it. */
export function SourceCard({
  node,
  item,
  incident,
  foundry,
  known,
  selected,
  onGraph,
  onViewFacts,
}: {
  node: EvidenceNode
  /** The evidence row (with this tab's local file, if any). */
  item?: EvidenceItem
  incident: Incident
  /** Screenshot reading needs Microsoft Foundry. */
  foundry: boolean
  known: KnownValues
  selected: boolean
  onGraph: (graph: EvidenceGraph | undefined) => void
  onViewFacts: () => void
}) {
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [reading, setReading] = useState<File | null>(null)
  const isCase = node.evidenceId === null
  const retry = node.processingStatus === "failed"

  // What this card can do depends on the file kind and whether the file is open in this tab.
  const action = (() => {
    if (!item || isCase) return undefined
    if (item.kind === "image") {
      if (!READABLE_IMAGE_TYPES.includes(item.mimeType)) return { blocked: "This image type can't be read." }
      if (!foundry) return { blocked: "Reading screenshots needs Microsoft Foundry, which isn't configured." }
      if (!item.objectUrl)
        return {
          blocked:
            "The file isn't open in this tab (files are never uploaded). Use the eye icon → “Open file from this device”, then read it.",
        }
      return {
        label: retry ? "Retry reading" : node.processingStatus === "not_processed" ? "Read details" : "Read again",
        icon: ScanText,
        run: openReader,
      }
    }
    if (item.kind === "pdf" || item.kind === "text") {
      const available = item.kind === "pdf" ? item.objectUrl : item.textPreview
      if (!available)
        return {
          blocked:
            "The file isn't open in this tab (files are never uploaded). Use the eye icon → “Open file from this device”, then read it.",
        }
      const noun = item.kind === "pdf" ? "statement" : "chat"
      return {
        label: retry ? "Retry" : node.processingStatus === "not_processed" ? `Read ${noun}` : `Read ${noun} again`,
        icon: TextSearch,
        run: () => setExtracting(true),
      }
    }
    return { blocked: "This file type can't be analysed. It stays on record as evidence." }
  })()

  async function openReader() {
    try {
      const blob = await (await fetch(item!.objectUrl!)).blob()
      setReading(new File([blob], item!.name, { type: item!.mimeType }))
    } catch {
      toast.error("This file is no longer available in this tab", { description: "Add it again to read its details." })
    }
  }

  const saveReading = async (readingId: string) => {
    const graph = await evidenceGraphService.analyze(incident.id, [
      { type: "screenshot_reading", evidenceId: node.evidenceId!, readingId },
    ])
    onGraph(graph)
    if (graph)
      toast.success("Saved to Evidence Intelligence", { description: "The details are unreviewed until you check them." })
    return graph !== undefined
  }

  const remove = async () => {
    if (await evidenceService.remove(node.evidenceId!)) toast.success("Evidence removed", { description: node.label })
  }

  return (
    <div
      id={node.evidenceId ? `source-card-${node.evidenceId}` : "source-card-case"}
      className={cn("flex h-full flex-col gap-2 rounded-xl border bg-card p-3", selected && "ring-2 ring-primary")}
    >
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <EvidenceIcon sourceType={node.sourceType} kind={node.kind} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={node.label}>
            {node.label}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {node.sourceType ? SOURCE_TYPE_LABELS[node.sourceType] : (item?.mimeType.split("/")[1]?.toUpperCase() ?? "File")}
            {node.size !== undefined && ` · ${formatFileSize(node.size)}`}
            {node.addedAt && ` · ${formatDateTime(node.addedAt)}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ProcessingBadge status={node.processingStatus} />
      </div>
      <dl className="grid grid-cols-3 gap-1 text-center">
        {[
          ["Facts", node.factCount],
          ["Matches", node.matchCount],
          ["To review", node.issueCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md bg-muted/50 py-1">
            <dt className="text-[10px] text-muted-foreground uppercase">{label}</dt>
            <dd
              className={cn("text-sm font-semibold tabular-nums", label === "To review" && Number(value) > 0 && "text-warning")}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {node.processingError && <p className="text-xs text-destructive">{node.processingError}</p>}
      {action && "blocked" in action && <p className="text-xs text-muted-foreground">{action.blocked}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        {action && "run" in action && action.run && (
          <Button size="sm" onClick={action.run}>
            {retry ? <RotateCcw aria-hidden /> : <action.icon aria-hidden />}
            {action.label}
          </Button>
        )}
        {node.factCount > 0 && (
          <Button size="sm" variant="ghost" onClick={onViewFacts}>
            <ListFilter aria-hidden />
            View facts
          </Button>
        )}
        {item && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPreview(true)}
              aria-label={`Details of ${node.label}`}
              className="ml-auto"
            >
              <Eye aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirm(true)}
              aria-label={`Remove ${node.label}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden />
            </Button>
          </>
        )}
      </div>

      {item && (
        <>
          {item.kind === "image" && item.objectUrl && foundry && (
            <ScreenshotReaderDialog
              file={reading}
              previewUrl={item.objectUrl}
              fields={["amount", "occurredAt", "transactionRef", "counterparty", "paymentMethod"]}
              evidenceId={item.id}
              saveOnly
              onOpenChange={(open) => !open && setReading(null)}
              onApply={async () => false}
              onSave={saveReading}
            />
          )}
          {(item.kind === "pdf" || item.kind === "text") && (
            <ExtractFactsDialog
              item={item}
              incidentId={incident.id}
              known={known}
              open={extracting}
              onOpenChange={setExtracting}
              onDone={onGraph}
            />
          )}
          <EvidencePreviewDialog item={item} incident={incident} open={preview} onOpenChange={setPreview} />
          <ConfirmationDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Remove this evidence?"
            description={
              <>
                <p>
                  <span className="font-medium text-foreground">{item.name}</span> and the facts read from it will be removed from{" "}
                  {incident.reference}.
                </p>
                <p>The original file on your device is not affected. This cannot be undone in the demo.</p>
              </>
            }
            confirmLabel="Remove evidence"
            destructive
            onConfirm={remove}
          />
        </>
      )}
    </div>
  )
}
