"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, FolderOpen, Info, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { kindFromMime } from "@/components/evidence/file-icon"
import { EvidenceUploader } from "@/components/evidence/evidence-uploader"
import { IncidentSummary, type IncidentSummaryData } from "@/components/incidents/incident-summary"
import { StepDetails } from "@/components/incidents/step-details"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useAnalysisEngine } from "@/features/agents/hooks"
import { useLocalFiles } from "@/features/evidence/use-local-files"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { actionPlanService, incidentService } from "@/lib/services"
import { cn } from "@/lib/utils"
import { incidentDetailsSchema, type IncidentFormValues, STEP_ONE_FIELDS } from "@/lib/validation/incident"
import type { AnalysisEngine, Currency, FraudCategory, Incident, TriState } from "@/types"

const STEPS = [
  { title: "What happened", description: "The essentials for an initial plan" },
  { title: "Add evidence", description: "Screenshots and documents" },
  { title: "Review", description: "Check before creating the case" },
  { title: "Case created", description: "Your next steps" },
] as const

function toSummary(v: IncidentFormValues): IncidentSummaryData {
  return {
    category: v.category as FraudCategory,
    title: v.title?.trim() || undefined,
    description: v.description.trim(),
    amount: Number(v.amount.replace(/,/g, "")),
    currency: v.currency as Currency,
    occurredAt: new Date(v.occurredAt).toISOString(),
    paymentMethod: v.paymentMethod,
    transactionRef: v.transactionRef?.trim() || undefined,
    hasAccountAccess: v.hasAccountAccess as TriState,
    ongoing: v.ongoing as TriState | undefined,
  }
}

export function IncidentWizard() {
  const [step, setStep] = useState(0)
  const [created, setCreated] = useState<Incident | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const local = useLocalFiles()
  const { engine, copy } = useAnalysisEngine()

  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentDetailsSchema),
    mode: "onTouched",
    defaultValues: {
      title: "",
      description: "",
      amount: "",
      currency: "INR",
      occurredAt: "",
      paymentMethod: "",
      transactionRef: "",
      confirmAccurate: false,
    },
  })

  const goTo = (next: number) => {
    setStep(next)
    // Move focus to the step heading for screen-reader and keyboard users.
    requestAnimationFrame(() => headingRef.current?.focus())
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const next = async () => {
    if (step === 0) {
      const ok = await form.trigger(STEP_ONE_FIELDS, { shouldFocus: true })
      if (!ok) {
        toast.error("Please check the highlighted fields")
        return
      }
    }
    if (step === 1 && !local.ready) {
      toast.info("Files are still being prepared locally")
      return
    }
    goTo(step + 1)
  }

  const submit = () =>
    form.handleSubmit(async (values) => {
      if (!values.confirmAccurate) {
        form.setError("confirmAccurate", { message: "Please confirm before creating the case" })
        return
      }
      setSubmitting(true)
      try {
        const data = toSummary(values)
        const incident = await incidentService.createIncident(
          { ...data, title: data.title ?? `${FRAUD_CATEGORIES[data.category].short} incident` },
          local.release(),
        )
        setCreated(incident)
        toast.success(`Demo case ${incident.reference} created`, { description: `${copy.started}.` })
        goTo(3)
      } catch {
        toast.error("We couldn't create the demo case", { description: "Nothing was lost — please try again." })
      } finally {
        setSubmitting(false)
      }
    })()

  const values = useWatch({ control: form.control }) as IncidentFormValues
  const confirmError = form.formState.errors.confirmAccurate?.message

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Report progress" className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1">
          {STEPS.map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "upcoming"
            return (
              <li
                key={s.title}
                className="min-w-[140px] flex-1 lg:min-w-0"
                aria-current={state === "current" ? "step" : undefined}
              >
                <div className={cn("flex items-center gap-3 rounded-xl p-2.5", state === "current" && "bg-primary/10")}>
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      state === "done" && "border-success bg-success text-background",
                      state === "current" && "border-primary bg-primary text-primary-foreground",
                      state === "upcoming" && "text-muted-foreground",
                    )}
                  >
                    {state === "done" ? <Check aria-hidden className="size-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>
                      {s.title}
                    </span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{s.description}</span>
                    <span className="sr-only">
                      {state === "done" ? "(completed)" : state === "current" ? "(current step)" : ""}
                    </span>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      </nav>

      <Card className="gap-6 p-5 md:p-7">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
            {step === 0 && "Tell us what happened"}
            {step === 1 && "Add any evidence you have"}
            {step === 2 && "Review your report"}
            {step === 3 && "Your demo case is ready"}
          </h2>
          {step === 0 && (
            <p className="text-sm text-muted-foreground">
              Only what&apos;s needed for an initial response plan. Approximate details are fine.
            </p>
          )}
          {step === 1 && (
            <p className="text-sm text-muted-foreground">
              Optional. Screenshots of payments, chats and SMS are most useful. You can add more later.
            </p>
          )}
        </div>

        {step === 0 && <StepDetails form={form} />}

        {step === 1 && (
          <EvidenceUploader
            files={local.files}
            rejected={local.rejected}
            onAdd={(f) => void local.addFiles(f)}
            onRemove={local.removeFile}
          />
        )}

        {step === 2 && (
          <div className="space-y-5">
            <IncidentSummary
              data={toSummary(values)}
              files={local.files.map((f) => ({ name: f.file.name, kind: kindFromMime(f.file.type), size: f.file.size }))}
              onEditDetails={() => goTo(0)}
              onEditEvidence={() => goTo(1)}
            />
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              <p className="text-muted-foreground">
                Submitting saves a <span className="font-medium text-foreground">demo case</span> to the STOPLOSS AI database.
                Only file names, types and sizes are saved — the files stay on your device. It does not contact your bank or file
                an official complaint.
                {engine === "foundry" && (
                  <>
                    {" "}
                    The AI agents will send these case details — not your files — to a{" "}
                    <span className="font-medium text-foreground">Microsoft Foundry</span> model for analysis.
                  </>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirmAccurate"
                  checked={values.confirmAccurate}
                  onCheckedChange={(c) => {
                    form.setValue("confirmAccurate", c === true)
                    if (c === true) form.clearErrors("confirmAccurate")
                  }}
                  aria-invalid={confirmError ? true : undefined}
                  aria-describedby={confirmError ? "confirmAccurate-error" : undefined}
                  className="mt-0.5"
                />
                <Label htmlFor="confirmAccurate" className="leading-snug font-normal">
                  These details are as accurate as I can reasonably provide right now.
                </Label>
              </div>
              {confirmError && (
                <p id="confirmAccurate-error" role="alert" className="pl-7 text-xs font-medium text-destructive">
                  {confirmError}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && created && <CreatedPanel incident={created} engine={engine} />}

        {step < 3 && (
          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
            ) : (
              <Button type="button" variant="ghost" asChild>
                <Link href="/dashboard">Cancel</Link>
              </Button>
            )}
            {step < 2 ? (
              <Button type="button" size="lg" onClick={() => void next()}>
                {step === 1 && local.files.length === 0 ? "Skip for now" : "Continue"}
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={() => void submit()} disabled={submitting}>
                {submitting ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <CheckCircle2 aria-hidden />}
                Create demo case
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function CreatedPanel({ incident, engine }: { incident: Incident; engine: AnalysisEngine }) {
  const firstAction = actionPlanService.suggestFirstAction(incident)
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/8 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/20 text-success">
          <CheckCircle2 aria-hidden className="size-6" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Case reference</p>
          <p className="font-mono text-2xl font-semibold tracking-wide">{incident.reference}</p>
        </div>
        <p className="text-sm text-muted-foreground">{FRAUD_CATEGORIES[incident.category].label}</p>
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Next recommended action</p>
        <p className="mt-1 font-medium">{firstAction?.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{firstAction?.explanation}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {engine === "foundry"
          ? "The four AI agents are now analysing your case on Microsoft Foundry. Their findings are AI-generated and unverified — review them before acting. Nothing has been sent to your bank or the police."
          : "The four demo agents are now running a simulated analysis of your case. This uses fixed templates, not a real AI model, and nothing has been sent to anyone."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg">
          <Link href={`/cases/${incident.id}`}>
            <FolderOpen aria-hidden />
            View case
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/agents?case=${incident.id}`}>
            <Bot aria-hidden />
            {engine === "foundry" ? "Open AI analysis" : "Open mock AI analysis"}
          </Link>
        </Button>
      </div>
    </div>
  )
}
