"use client"

import { useRef } from "react"
import { FolderOpen } from "lucide-react"

import { FileIcon } from "@/components/evidence/file-icon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EVIDENCE_KINDS } from "@/lib/config/taxonomy"
import { evidenceService } from "@/lib/services"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceItem, Incident } from "@/types"

interface Props {
  item: EvidenceItem
  incident?: Incident
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Kinds this dialog can preview when the file is open in the tab. */
const PREVIEWABLE = new Set(["image", "pdf", "text"])

export function EvidencePreviewDialog({ item, incident, open, onOpenChange }: Props) {
  const picker = useRef<HTMLInputElement>(null)
  const hasLocalFile = Boolean(item.objectUrl || item.textPreview)
  const supported = PREVIEWABLE.has(item.kind)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item.name}</DialogTitle>
          <DialogDescription>
            {item.isSample
              ? "Sample metadata record — no file is attached in this demo."
              : hasLocalFile
                ? "Preview from this browser tab. The file itself was not uploaded."
                : "Only this file's details are saved. The file itself stays on your device and was never uploaded."}
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
              {item.isSample ? (
                <p className="text-sm text-muted-foreground">Preview not available for sample records.</p>
              ) : !supported ? (
                <p className="text-sm text-muted-foreground">Preview isn&apos;t supported for this file type.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">This file isn&apos;t open in this browser tab</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Files are never uploaded, so previews only exist in the tab where they were added. Open the same file from
                      your device to preview it here — it still won&apos;t be uploaded.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => picker.current?.click()}>
                    <FolderOpen aria-hidden />
                    Open file from this device
                  </Button>
                  <input
                    ref={picker}
                    type="file"
                    accept={item.mimeType}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (file) await evidenceService.attachLocalFile(item.id, file)
                    }}
                  />
                </>
              )}
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
