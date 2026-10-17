"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, ScanText, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { extractionService } from "@/lib/services"
import { formatCurrency, formatDateTime } from "@/lib/utils/format"
import type { ScreenshotReading } from "@/types"

/** Fields a screenshot can fill in. */
export type ReadableField = "amount" | "occurredAt" | "transactionRef" | "counterparty" | "paymentMethod"

export type ReadingPatch = Partial<Pick<ScreenshotReading, ReadableField | "currency">>

const LABELS: Record<ReadableField, string> = {
  amount: "Amount",
  occurredAt: "Date and time",
  transactionRef: "Transaction reference (UTR / RRN)",
  counterparty: "Money sent to (UPI ID, phone or account)",
  paymentMethod: "Payment method",
}

const ORDER: ReadableField[] = ["amount", "occurredAt", "transactionRef", "counterparty", "paymentMethod"]

function display(field: ReadableField, r: ScreenshotReading) {
  if (field === "amount") return formatCurrency(r.amount!, r.currency)
  if (field === "occurredAt") return formatDateTime(r.occurredAt!)
  return String(r[field])
}

type Phase =
  { name: "consent" } | { name: "reading" } | { name: "done"; reading: ScreenshotReading } | { name: "error"; message: string }

/**
 * Reads one screenshot with the person's explicit consent and lets them choose
 * which of the found details to use. Nothing is applied without confirmation.
 */
export function ScreenshotReaderDialog({
  file,
  previewUrl,
  fields,
  current = {},
  onOpenChange,
  onApply,
}: {
  /** The image to read; the dialog is open while this is set. */
  file: File | null
  /** Local preview (object URL) of the same image, owned by the caller. */
  previewUrl?: string
  /** Which fields the caller can fill. */
  fields: ReadableField[]
  /** Values already entered, so the person can see what would change. */
  current?: Partial<Record<ReadableField, string | number | undefined>>
  onOpenChange: (open: boolean) => void
  onApply: (patch: ReadingPatch) => boolean | Promise<boolean>
}) {
  const [phase, setPhase] = useState<Phase>({ name: "consent" })
  const [selected, setSelected] = useState<Set<ReadableField>>(new Set())
  const [applying, setApplying] = useState(false)

  // Start over for each new file.
  const [shownFile, setShownFile] = useState(file)
  if (file !== shownFile) {
    setShownFile(file)
    setPhase({ name: "consent" })
    setSelected(new Set())
  }

  // Ignore a reading that finishes after the dialog moved on to another file.
  const latestFile = useRef(file)
  useEffect(() => {
    latestFile.current = file
  }, [file])

  const read = async () => {
    if (!file) return
    setPhase({ name: "reading" })
    try {
      const reading = await extractionService.readScreenshot(file)
      if (latestFile.current !== file) return
      setPhase({ name: "done", reading })
      // Pre-select everything found that isn't already entered.
      setSelected(new Set(found(reading).filter((f) => current[f] !== reading[f])))
    } catch (error) {
      if (latestFile.current !== file) return
      setPhase({ name: "error", message: (error as Error).message })
    }
  }

  const found = (r: ScreenshotReading) => ORDER.filter((f) => fields.includes(f) && r[f] !== undefined)

  const apply = async () => {
    if (phase.name !== "done") return
    const r = phase.reading
    const patch: ReadingPatch = {}
    for (const f of selected) Object.assign(patch, { [f]: r[f] })
    if (selected.has("amount")) patch.currency = r.currency
    setApplying(true)
    try {
      if (await onApply(patch)) onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  const toggle = (f: ReadableField, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(f)
      else next.delete(f)
      return next
    })

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText aria-hidden className="size-5 text-primary" />
            Read details from screenshot
          </DialogTitle>
          <DialogDescription className="truncate">{file?.name}</DialogDescription>
        </DialogHeader>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL, never uploaded
          <img
            src={previewUrl}
            alt="The screenshot to read"
            className="max-h-48 w-full rounded-md border bg-muted object-contain"
          />
        )}

        {phase.name === "consent" && (
          <div className="space-y-3 text-sm">
            <p>
              This screenshot will be sent <span className="font-medium">once</span> to the{" "}
              <span className="font-medium">Microsoft Foundry</span> AI model to find the amount, date, transaction reference and
              who received the money.
            </p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                The image is not saved by STOPLOSS AI or kept by Foundry. Only the details found come back.
              </li>
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                OTPs, PINs, passwords and card numbers are never read into your case.
              </li>
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                You choose which details to use. Nothing changes until you confirm.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Prefer not to? Close this and type the details yourself. The screenshot then stays on your device.
            </p>
          </div>
        )}

        {phase.name === "reading" && (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Reading the screenshot… this usually takes a few seconds.
          </p>
        )}

        {phase.name === "error" && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {phase.message}
          </p>
        )}

        {phase.name === "done" && (
          <Results
            reading={phase.reading}
            fields={found(phase.reading)}
            current={current}
            selected={selected}
            onToggle={toggle}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {phase.name === "done" ? "Cancel" : "Close"}
          </Button>
          {(phase.name === "consent" || phase.name === "error") && (
            <Button type="button" onClick={read}>
              {phase.name === "error" ? "Try again" : "Read screenshot"}
            </Button>
          )}
          {phase.name === "done" && found(phase.reading).length > 0 && (
            <Button type="button" onClick={apply} disabled={selected.size === 0 || applying}>
              {applying && <Loader2 aria-hidden className="animate-spin" />}
              Use {selected.size === 1 ? "this detail" : `${selected.size} details`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Results({
  reading,
  fields,
  current,
  selected,
  onToggle,
}: {
  reading: ScreenshotReading
  fields: ReadableField[]
  current: Partial<Record<ReadableField, string | number | undefined>>
  selected: Set<ReadableField>
  onToggle: (f: ReadableField, on: boolean) => void
}) {
  const warnings: string[] = []
  if (reading.containsSensitiveData)
    warnings.push(
      "This screenshot shows an OTP, PIN, password or card number. Those were ignored. Never share them with anyone — banks and police will not ask for them.",
    )
  if (!reading.isPaymentRecord)
    warnings.push("This doesn't look like a payment record. Check any details below against your bank SMS or statement.")
  if (reading.direction === "credit")
    warnings.push("This looks like money received, not sent. Make sure it's the payment you're reporting.")
  if (reading.note) warnings.push(reading.note)

  return (
    <div className="space-y-3">
      {warnings.map((w) => (
        <p key={w} className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {w}
        </p>
      ))}
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment details were found in this screenshot.</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Choose the details to use</legend>
          {fields.map((f) => {
            const existing = current[f]
            const same = existing === reading[f]
            const changes = !same && existing !== undefined && existing !== ""
            return (
              <div key={f} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id={`read-${f}`}
                  checked={selected.has(f)}
                  onCheckedChange={(c) => onToggle(f, c === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={`read-${f}`} className="block flex-1 font-normal">
                  <span className="block text-xs text-muted-foreground">{LABELS[f]}</span>
                  <span className="mt-0.5 block font-medium break-all">{display(f, reading)}</span>
                  {(same || changes) && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {same ? "Already entered" : "Replaces what you entered"}
                    </span>
                  )}
                </Label>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">
            AI can misread screenshots. Check each detail — you can still edit it afterwards.
          </p>
        </fieldset>
      )}
    </div>
  )
}
