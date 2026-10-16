"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { StickyNote, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { fieldA11y, FormField } from "@/components/shared/form-field"
import { EmptyState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { caseService } from "@/lib/services"
import { formatDateTime } from "@/lib/utils/format"
import { noteSchema } from "@/lib/validation/incident"
import type { Incident } from "@/types"

export function CaseNotesTab({ incident }: { incident: Incident }) {
  const form = useForm<{ body: string }>({ resolver: zodResolver(noteSchema), defaultValues: { body: "" } })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const error = form.formState.errors.body?.message
  const body = useWatch({ control: form.control, name: "body" }) ?? ""

  const submit = form.handleSubmit(async ({ body }) => {
    if (!(await caseService.addNote(incident.id, body.trim()))) return
    form.reset({ body: "" })
    toast.success("Note added")
  })

  const notes = [...incident.notes].reverse()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="h-fit gap-4 p-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField
            id="note-body"
            label="Add a note"
            hint={
              <span className="flex justify-between gap-2">
                <span>Useful for complaint numbers, call times and who you spoke to. Never include PINs, OTPs or passwords.</span>
                <span className="shrink-0 tabular-nums">{body.length}/1000</span>
              </span>
            }
            error={error}
          >
            <Textarea
              {...form.register("body")}
              {...fieldA11y("note-body", error, true)}
              rows={4}
              placeholder="e.g. Called bank helpline at 8:10 pm, complaint no. received by SMS"
            />
          </FormField>
          <Button type="submit">Save note</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {notes.length === 0 ? (
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            description="Keep a running record of calls, reference numbers and next steps."
          />
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm whitespace-pre-line">{n.body}</p>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDeleteId(n.id)} aria-label="Delete note">
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete this note?"
        description={<p>This can&apos;t be undone.</p>}
        confirmLabel="Delete note"
        destructive
        onConfirm={async () => {
          if (deleteId && (await caseService.removeNote(incident.id, deleteId))) toast.success("Note deleted")
        }}
      />
    </div>
  )
}
