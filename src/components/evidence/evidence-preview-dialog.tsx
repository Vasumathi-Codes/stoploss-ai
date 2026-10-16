"use client"

import { FileIcon } from "@/components/evidence/file-icon"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EVIDENCE_KINDS } from "@/lib/config/taxonomy"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceItem, Incident } from "@/types"

interface Props {
  item: EvidenceItem
  incident?: Incident
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EvidencePreviewDialog({ item, incident, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item.name}</DialogTitle>
          <DialogDescription>
            {item.isSample
              ? "Sample metadata record — no file is attached in this demo."
              : "Stored only in this browser tab. Not uploaded or analysed."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border bg-muted/40">
          {item.kind === "image" && item.objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={item.objectUrl} alt={`Preview of ${item.name}`} className="mx-auto max-h-[50dvh] object-contain" />
          ) : item.kind === "pdf" && item.objectUrl ? (
            <iframe src={item.objectUrl} title={`Preview of ${item.name}`} className="h-[50dvh] w-full bg-white" />
          ) : item.kind === "text" && item.textPreview ? (
            <pre className="max-h-[50dvh] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">{item.textPreview}</pre>
          ) : (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <FileIcon kind={item.kind} className="size-14" />
              <p className="text-sm text-muted-foreground">
                {item.isSample ? "Preview not available for sample records." : "Preview isn't supported for this file type."}
              </p>
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Type</dt>
            <dd>
              {EVIDENCE_KINDS[item.kind].label} ({item.mimeType})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Size</dt>
            <dd>{formatFileSize(item.size)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Added</dt>
            <dd>{formatDateTime(item.addedAt)}</dd>
          </div>
          {incident && (
            <div>
              <dt className="text-xs text-muted-foreground">Case</dt>
              <dd>{incident.reference}</dd>
            </div>
          )}
          {item.description && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Description</dt>
              <dd>{item.description}</dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
