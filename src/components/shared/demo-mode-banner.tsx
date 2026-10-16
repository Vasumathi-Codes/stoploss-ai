"use client"

import { FlaskConical } from "lucide-react"

import { useAnalysisEngine } from "@/features/agents/hooks"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/** Always-visible indicator of what is real in this prototype and what is not. */
export function DemoModeBanner() {
  const { engine, model } = useAnalysisEngine()
  const foundry = engine === "foundry"
  return (
    <div className="border-b border-warning/25 bg-warning/10 text-warning">
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium">
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">
          <span className="font-semibold">Demo Mode</span>
          <span className="hidden sm:inline">
            {foundry ? " — sample data; agents run on Microsoft Foundry." : " — sample data and simulated agents."} Nothing is
            sent to a bank or the police.
          </span>
        </span>
        <Dialog>
          <DialogTrigger className="shrink-0 rounded underline underline-offset-2 hover:no-underline">Learn more</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>About Demo Mode</DialogTitle>
              <DialogDescription>What this prototype does and does not do.</DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {foundry ? (
                <li>
                  Agent analysis runs on a Microsoft Foundry model{model ? ` (${model})` : ""}. Your case details — not your
                  evidence files — are sent to it. AI findings are labelled and unverified; the action plan comes from the
                  app&apos;s configured guidance. Sample cases keep their original template analysis until you rerun them.
                </li>
              ) : (
                <li>
                  Agent findings are produced by fixed templates on the server. No AI model, Microsoft Foundry or other service is
                  called.
                </li>
              )}
              <li>Cases and notes are saved in the app&apos;s database. Settings → Reset demo data restores the sample cases.</li>
              <li>
                Evidence files never leave your device — only their names, types and sizes are saved — and are not analysed.
              </li>
              <li>
                STOPLOSS AI never contacts your bank, files a complaint or freezes an account, and cannot promise that money will
                be recovered.
              </li>
              <li>All sample people, amounts and reference numbers are fictional.</li>
            </ul>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
