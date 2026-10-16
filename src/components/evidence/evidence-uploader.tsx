"use client"

import { useId, useRef, useState } from "react"
import { AlertCircle, ShieldAlert, Upload, X } from "lucide-react"

import { FileIcon, kindFromMime } from "@/components/evidence/file-icon"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ACCEPT_ATTR, MAX_FILES, type PendingFile, type RejectedFile } from "@/features/evidence/use-local-files"
import { cn } from "@/lib/utils"
import { formatFileSize } from "@/lib/utils/format"

interface EvidenceUploaderProps {
  files: PendingFile[]
  rejected: RejectedFile[]
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  className?: string
}

export function EvidenceUploader({ files, rejected, onAdd, onRemove, className }: EvidenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hintId = useId()

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onAdd(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/8" : "border-border hover:border-primary/50",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Upload aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Drag and drop files here</p>
          <p id={hintId} className="text-sm text-muted-foreground">
            PNG, JPEG, PDF or TXT · up to 10 MB each · {MAX_FILES} files max
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []))
            e.target.value = ""
          }}
        />
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Don&apos;t upload passwords, PINs, OTPs or unrelated personal documents. In this demo, files stay in your browser and
          are never sent to a server or analysed.
        </span>
      </p>

      {rejected.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle aria-hidden className="size-4" />
            {rejected.length === 1 ? "1 file was not added" : `${rejected.length} files were not added`}
          </p>
          <ul className="space-y-0.5 pl-6 text-muted-foreground">
            {rejected.map((r) => (
              <li key={r.name + r.reason}>
                <span className="font-medium text-foreground">{r.name}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Selected files">
          {files.map((f) => {
            const kind = kindFromMime(f.file.type)
            return (
              <li key={f.id} className="flex gap-3 rounded-xl border bg-card p-3">
                {kind === "image" && f.objectUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimisable
                  <img src={f.objectUrl} alt={`Preview of ${f.file.name}`} className="size-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <FileIcon kind={kind} className="size-14" />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium" title={f.file.name}>
                      {f.file.name}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemove(f.id)}
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.file.type.split("/")[1]?.toUpperCase()} · {formatFileSize(f.file.size)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Progress value={f.progress} className="h-1.5" aria-label={`${f.file.name} local processing`} />
                    <span className="w-16 text-right text-[11px] text-muted-foreground tabular-nums">
                      {f.progress >= 100 ? "Ready" : `${f.progress}%`}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
