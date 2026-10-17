"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, FileText, FlaskConical, MonitorSmartphone, ScanText, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EvidencePreviewDialog } from "@/components/evidence/evidence-preview-dialog"
import { FileIcon } from "@/components/evidence/file-icon"
import { type ReadingPatch, ScreenshotReaderDialog } from "@/components/evidence/screenshot-reader-dialog"
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { useAnalysisEngine } from "@/features/agents/hooks"
import { READABLE_IMAGE_TYPES } from "@/lib/images/prepare-screenshot"
import { caseService, evidenceGraphService, evidenceService } from "@/lib/services"
import { cn } from "@/lib/utils"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceItem, Incident } from "@/types"

interface EvidenceCardProps {
  item: EvidenceItem
  /** Shown as a link to the case. */
  incident?: Incident
  /** The case that details read from this file are added to. Defaults to `incident`. */
  readInto?: Incident
  layout?: "grid" | "list"
  selectable?: { selected: boolean; onToggle: () => void }
}

export function EvidenceCard({ item, incident, readInto = incident, layout = "grid", selectable }: EvidenceCardProps) {
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const isImage = item.kind === "image" && item.objectUrl
  const { engine } = useAnalysisEngine()
  const [reading, setReading] = useState<File | null>(null)
  // Only images still open in this tab can be read; the server never has the file.
  const canRead = engine === "foundry" && readInto && isImage && READABLE_IMAGE_TYPES.includes(item.mimeType)

  const openReader = async () => {
    try {
      const blob = await (await fetch(item.objectUrl!)).blob()
      setReading(new File([blob], item.name, { type: item.mimeType }))
    } catch {
      toast.error("This file is no longer available in this tab", { description: "Add it again to read its details." })
    }
  }

  /** Cases keep amount and date as reported; a screenshot can add the reference and recipient. */
  const applyReading = async (patch: ReadingPatch, readingId?: string) => {
    if (!readInto) return false
    const ok = await caseService.updateDetails(readInto.id, {
      transactionRef: patch.transactionRef,
      counterparty: patch.counterparty,
    })
    if (!ok) return false
    // Keep what was read as unreviewed facts too, so Evidence Intelligence can cross-check it.
    const saved = readingId ? await saveReading(readingId) : false
    toast.success("Case details updated", {
      description: saved
        ? "Also saved to Evidence Intelligence for cross-checking."
        : "The agents' checklist has been refreshed.",
    })
    return true
  }

  const saveReading = async (readingId: string) => {
    if (!readInto) return false
    const graph = await evidenceGraphService.analyze(readInto.id, [
      { type: "screenshot_reading", evidenceId: item.id, readingId },
    ])
    return graph !== undefined
  }

  const remove = async () => {
    if (await evidenceService.remove(item.id)) toast.success("Evidence removed", { description: item.name })
  }

  const actions = (
    <div className="flex items-center gap-1">
      {canRead && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openReader}
          aria-label={`Read details from ${item.name}`}
          title="Read details"
        >
          <ScanText aria-hidden />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={() => setPreview(true)} aria-label={`Preview ${item.name}`}>
        <Eye aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setConfirm(true)}
        aria-label={`Remove ${item.name}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )

  const hasLocalFile = Boolean(item.objectUrl || item.textPreview)
  const meta = (
    <p className="text-xs text-muted-foreground">
      {item.mimeType.split("/")[1]?.toUpperCase()} · {formatFileSize(item.size)} · Added {formatDateTime(item.addedAt)}
    </p>
  )
  // Where the file itself is: only this browser tab ever holds it; the server keeps metadata.
  const fileStatus = (
    <p
      className="flex items-center gap-1 text-[11px] text-muted-foreground"
      title={
        hasLocalFile
          ? "The file is available in this browser tab only. It was not uploaded."
          : "Only the file's name, type and size are saved. The file itself isn't on this device session."
      }
    >
      {hasLocalFile ? (
        <MonitorSmartphone aria-hidden className="size-3 text-success" />
      ) : (
        <FileText aria-hidden className="size-3" />
      )}
      {hasLocalFile
        ? "File available in this tab"
        : item.isSample
          ? "Sample record · details only"
          : "Details only · file not in this tab"}
    </p>
  )

  return (
    <>
      {layout === "grid" ? (
        <div
          className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", selectable?.selected && "ring-2 ring-primary")}
        >
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="relative flex h-28 items-center justify-center bg-muted/40"
            aria-label={`Preview ${item.name}`}
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={item.objectUrl} alt="" className="size-full object-cover" />
            ) : (
              <FileIcon kind={item.kind} className="size-12" />
            )}
            {item.isSample && (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <FlaskConical aria-hidden className="size-3" />
                Sample record
              </span>
            )}
          </button>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="flex items-start gap-2">
              {selectable && (
                <input
                  type="checkbox"
                  checked={selectable.selected}
                  onChange={selectable.onToggle}
                  aria-label={`Include ${item.name} in package preview`}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
            </div>
            {meta}
            {fileStatus}
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              {incident ? (
                <Link href={`/cases/${incident.id}`} className="truncate text-xs font-medium text-primary hover:underline">
                  {incident.reference}
                </Link>
              ) : (
                <span />
              )}
              {actions}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", selectable?.selected && "ring-2 ring-primary")}
        >
          {selectable && (
            <input
              type="checkbox"
              checked={selectable.selected}
              onChange={selectable.onToggle}
              aria-label={`Include ${item.name} in package preview`}
              className="size-4 accent-[var(--primary)]"
            />
          )}
          <FileIcon kind={item.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.name}>
              {item.name}
            </p>
            {meta}
            {fileStatus}
          </div>
          {incident && (
            <Link href={`/cases/${incident.id}`} className="hidden text-xs font-medium text-primary hover:underline sm:inline">
              {incident.reference}
            </Link>
          )}
          {actions}
        </div>
      )}
      {canRead && (
        <ScreenshotReaderDialog
          file={reading}
          previewUrl={item.objectUrl}
          fields={["transactionRef", "counterparty"]}
          current={{ transactionRef: readInto.transactionRef, counterparty: readInto.counterparty }}
          evidenceId={item.id}
          onOpenChange={(open) => !open && setReading(null)}
          onApply={applyReading}
          onSave={async (readingId) => {
            const ok = await saveReading(readingId)
            if (ok)
              toast.success("Saved to Evidence Intelligence", { description: "The details are unreviewed until you check them." })
            return ok
          }}
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
              <span className="font-medium text-foreground">{item.name}</span> will be removed from{" "}
              {incident?.reference ?? "this case"}.
            </p>
            <p>The original file on your device is not affected. This cannot be undone in the demo.</p>
          </>
        }
        confirmLabel="Remove evidence"
        destructive
        onConfirm={remove}
      />
    </>
  )
}
