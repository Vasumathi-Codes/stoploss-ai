"use client"

import { FlaskConical } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/** Always-visible indicator that everything in the app is simulated. */
export function DemoModeBanner() {
  return (
    <div className="border-b border-warning/25 bg-warning/10 text-warning">
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium">
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">
          <span className="font-semibold">Demo Mode</span>
          <span className="hidden sm:inline">
            {" "}
            — fictional data and simulated agents. Nothing is sent to a bank, police or any server.
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
              <li>
                Agent findings are produced by fixed templates in your browser. No AI model, Microsoft Foundry or other service is
                called.
              </li>
              <li>
                Cases, notes and evidence live only in this tab&apos;s memory. Refreshing the page restores the sample data.
              </li>
              <li>Uploaded files never leave your device and are not analysed.</li>
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
