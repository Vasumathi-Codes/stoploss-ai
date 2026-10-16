"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, FlaskConical, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EvidencePreviewDialog } from "@/components/evidence/evidence-preview-dialog"
import { FileIcon } from "@/components/evidence/file-icon"
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { evidenceService } from "@/lib/services"
import { cn } from "@/lib/utils"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceItem, Incident } from "@/types"

interface EvidenceCardProps {
  item: EvidenceItem
  incident?: Incident
  layout?: "grid" | "list"
  selectable?: { selected: boolean; onToggle: () => void }
}

export function EvidenceCard({ item, incident, layout = "grid", selectable }: EvidenceCardProps) {
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const isImage = item.kind === "image" && item.objectUrl

  const remove = () => {
    evidenceService.remove(item.id)
    toast.success("Evidence removed", { description: item.name })
  }

  const actions = (
    <div className="flex items-center gap-1">
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

  const meta = (
    <p className="text-xs text-muted-foreground">
      {item.mimeType.split("/")[1]?.toUpperCase()} · {formatFileSize(item.size)} · {formatDateTime(item.addedAt)}
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
            className="relative flex h-32 items-center justify-center bg-muted/50"
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
              {item.isSample && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(sample record)</span>}
            </p>
            {meta}
          </div>
          {incident && (
            <Link href={`/cases/${incident.id}`} className="hidden text-xs font-medium text-primary hover:underline sm:inline">
              {incident.reference}
            </Link>
          )}
          {actions}
        </div>
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
