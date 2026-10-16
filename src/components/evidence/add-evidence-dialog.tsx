"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { toast } from "sonner"

import { EvidenceUploader } from "@/components/evidence/evidence-uploader"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIncidents } from "@/features/cases/hooks"
import { useLocalFiles } from "@/features/evidence/use-local-files"
import { evidenceService } from "@/lib/services"

type ButtonProps = React.ComponentProps<typeof Button>

/** Inner body is mounted only while open so picked files are cleaned up on close. */
function AddEvidenceBody({ fixedIncidentId, onDone }: { fixedIncidentId?: string; onDone: () => void }) {
  const incidents = useIncidents().filter((i) => i.status !== "archived")
  const [incidentId, setIncidentId] = useState(fixedIncidentId ?? incidents[0]?.id ?? "")
  const { files, rejected, addFiles, removeFile, release, ready } = useLocalFiles()

  const save = () => {
    const picked = release()
    evidenceService.addFiles(incidentId, picked)
    const ref = incidents.find((i) => i.id === incidentId)?.reference
    toast.success(`${picked.length} file${picked.length === 1 ? "" : "s"} added to ${ref}`, {
      description: "Stored in this browser tab only.",
    })
    onDone()
  }

  return (
    <>
      {!fixedIncidentId && (
        <div className="space-y-1.5">
          <Label htmlFor="evidence-case">Add to case</Label>
          <Select value={incidentId} onValueChange={setIncidentId}>
            <SelectTrigger id="evidence-case" className="w-full">
              <SelectValue placeholder="Choose a case" />
            </SelectTrigger>
            <SelectContent>
              {incidents.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.reference} · {i.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <EvidenceUploader files={files} rejected={rejected} onAdd={(f) => void addFiles(f)} onRemove={removeFile} />
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={files.length === 0 || !ready || !incidentId}>
          Add {files.length > 0 ? files.length : ""} file{files.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function AddEvidenceDialog({
  incidentId,
  triggerLabel = "Upload Evidence",
  variant = "default",
  size = "default",
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: {
  incidentId?: string
  triggerLabel?: string
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  return (
    <>
      {!hideTrigger && (
        <Button variant={variant} size={size} onClick={() => setOpen(true)}>
          <Upload aria-hidden />
          {triggerLabel}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add evidence</DialogTitle>
            <DialogDescription>Files are kept in this browser tab only and are never transmitted.</DialogDescription>
          </DialogHeader>
          {open && <AddEvidenceBody fixedIncidentId={incidentId} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
