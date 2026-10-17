"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, ShieldCheck, TextSearch } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { type ChatMessage, factsFromChat, parseChatExport } from "@/lib/evidence/chat-parser"
import { FACT_TYPE_LABELS } from "@/lib/evidence/labels"
import { formatMinor, maskValue } from "@/lib/evidence/normalize"
import { extractPdfLines } from "@/lib/evidence/pdf-text"
import { detectHeader, parseStatementLines, type StatementLine, type StatementTransaction } from "@/lib/evidence/statement-parser"
import type { EvidenceGraph, ExtractedFact } from "@/lib/evidence/types"
import { evidenceGraphService } from "@/lib/services"
import { formatDate, formatDateTime } from "@/lib/utils/format"
import type { AnalyzeSource } from "@/lib/validation/evidence-graph"
import type { EvidenceItem } from "@/types"

type Parsed =
  | { kind: "chat"; messages: ChatMessage[]; facts: Map<number, ExtractedFact[]> }
  | { kind: "statement"; lines: StatementLine[]; transactions: StatementTransaction[]; truncated: boolean }

type Phase =
  | { name: "consent" }
  | { name: "parsing" }
  | { name: "select"; parsed: Parsed }
  | { name: "unsupported"; reason: "scanned_pdf" | "unrecognised_statement" | "unrecognised_chat"; message: string }
  | { name: "error"; message: string }

/** Values already in the graph, used to pre-select statement lines that look relevant. */
export interface KnownValues {
  references: Set<string>
  amounts: Set<number>
}

/**
 * Reads a chat export (.txt) or a digital bank statement (PDF) in the browser with fixed rules —
 * no AI. The person picks which messages or lines to add; only those are sent, and the server
 * re-parses and screens them before storing the facts found (not the text).
 */
export function ExtractFactsDialog({
  item,
  incidentId,
  known,
  open,
  onOpenChange,
  onDone,
}: {
  item: EvidenceItem
  incidentId: string
  known: KnownValues
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (graph: EvidenceGraph) => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: "consent" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const isPdf = item.kind === "pdf"

  const reset = (o: boolean) => {
    if (!o) {
      setPhase({ name: "consent" })
      setChosen(new Set())
    }
    onOpenChange(o)
  }

  const parse = async () => {
    setPhase({ name: "parsing" })
    try {
      if (isPdf) {
        if (!item.objectUrl)
          throw new Error("This file isn't open in this tab. Open it from the evidence details (eye icon), then try again.")
        const data = await (await fetch(item.objectUrl)).arrayBuffer()
        const { lines, hasText, truncated } = await extractPdfLines(data)
        if (!hasText) {
          setPhase({
            name: "unsupported",
            reason: "scanned_pdf",
            message: "This PDF has no text layer — it may be a scan or photo. Scanned statements can't be read yet.",
          })
          return
        }
        const { headerFound, transactions } = parseStatementLines(lines)
        if (!headerFound || transactions.length === 0) {
          setPhase({
            name: "unsupported",
            reason: "unrecognised_statement",
            message: "No statement table with Date, Debit and Credit columns was found in this PDF.",
          })
          return
        }
        setChosen(
          new Set(
            transactions
              .filter((t) => {
                const ref = t.referenceText?.split(/\s+/).pop()?.toUpperCase()
                return (
                  (ref && known.references.has(ref)) ||
                  known.amounts.has(t.debitMinor ?? -1) ||
                  known.amounts.has(t.creditMinor ?? -1)
                )
              })
              .map((t) => `${t.page}:${t.line}`),
          ),
        )
        setPhase({ name: "select", parsed: { kind: "statement", lines, transactions, truncated } })
      } else {
        if (!item.textPreview)
          throw new Error("This file isn't open in this tab. Open it from the evidence details (eye icon), then try again.")
        const { messages, recognised } = parseChatExport(item.textPreview)
        if (!recognised) {
          setPhase({
            name: "unsupported",
            reason: "unrecognised_chat",
            message: "This text file isn't in a recognised chat-export format (e.g. WhatsApp's “Export chat”).",
          })
          return
        }
        const facts = new Map<number, ExtractedFact[]>()
        for (const f of factsFromChat(item.id, messages)) {
          const index = Number(f.recordKey.split(":").pop())
          facts.set(index, [...(facts.get(index) ?? []), f])
        }
        setChosen(new Set([...facts.keys()].map(String)))
        setPhase({ name: "select", parsed: { kind: "chat", messages, facts } })
      }
    } catch (error) {
      const name = (error as Error).name
      setPhase({
        name: "error",
        message:
          name === "PasswordException"
            ? "This PDF is password-protected and can't be read."
            : (error as Error).message || "The file couldn't be read.",
      })
    }
  }

  const send = async (source: AnalyzeSource) => {
    setSending(true)
    try {
      const graph = await evidenceGraphService.analyze(incidentId, [source])
      if (graph) {
        onDone(graph)
        reset(false)
      }
    } finally {
      setSending(false)
    }
  }

  const submit = () => {
    if (phase.name === "unsupported") return send({ type: "unsupported", evidenceId: item.id, reason: phase.reason })
    if (phase.name !== "select") return
    const p = phase.parsed
    if (p.kind === "chat") {
      const messages = p.messages
        .filter((m) => chosen.has(String(m.index)))
        .map((m) => ({ index: m.index, text: m.raw.slice(0, 4000) }))
      return send({ type: "chat_export", evidenceId: item.id, messages })
    }
    // Header lines go along so the server can re-assign columns itself.
    const lines = p.lines.filter((l) => detectHeader(l) || chosen.has(`${l.page}:${l.line}`))
    return send({ type: "bank_statement", evidenceId: item.id, lines })
  }

  const toggle = (key: string, on: boolean) =>
    setChosen((s) => {
      const next = new Set(s)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TextSearch aria-hidden className="size-5 text-primary" />
            {isPdf ? "Read bank statement" : "Read chat export"}
          </DialogTitle>
          <DialogDescription className="truncate">{item.name}</DialogDescription>
        </DialogHeader>

        {phase.name === "consent" && (
          <div className="space-y-3 text-sm">
            <p>
              The file is read <span className="font-medium">in your browser</span> by fixed rules — no AI model is used. You then
              choose which {isPdf ? "statement lines" : "messages"} to add.
            </p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                Only the {isPdf ? "lines" : "messages"} you tick are sent. STOPLOSS AI re-checks them and keeps the details found
                (amounts, dates, references, UPI IDs, phone numbers) — not the file{isPdf ? ", balances" : " or message text"}.
              </li>
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                OTPs, PINs, passwords and card numbers are never kept. Messages containing them are skipped.
              </li>
              <li className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                Links and anything else in the file are never opened or run.
              </li>
            </ul>
          </div>
        )}

        {phase.name === "parsing" && (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Reading the file in your browser…
          </p>
        )}

        {phase.name === "error" && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {phase.message}
          </p>
        )}

        {phase.name === "unsupported" && (
          <div className="space-y-2">
            <p className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {phase.message}
            </p>
            <p className="text-sm text-muted-foreground">
              The file stays on record as evidence. You can mark it as not readable so it isn&apos;t counted as waiting for
              analysis.
            </p>
          </div>
        )}

        {phase.name === "select" && phase.parsed.kind === "statement" && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Choose the transactions that relate to this case</legend>
            <p className="text-xs text-muted-foreground">
              Lines matching a reference or amount already in this case are pre-selected.
            </p>
            {phase.parsed.truncated && <p className="text-xs text-warning">Only the first 20 pages were read.</p>}
            <ul className="divide-y rounded-md border">
              {phase.parsed.transactions.map((t) => {
                const key = `${t.page}:${t.line}`
                return (
                  <li key={key} className="flex items-start gap-3 p-2.5">
                    <Checkbox
                      id={`line-${key}`}
                      checked={chosen.has(key)}
                      onCheckedChange={(c) => toggle(key, c === true)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`line-${key}`}
                      className="grid flex-1 gap-0.5 text-sm sm:grid-cols-[6.5rem_1fr_auto] sm:gap-3"
                    >
                      <span className="text-muted-foreground">{formatDate(`${t.date}T06:30:00.000Z`)}</span>
                      <span className="min-w-0 truncate" title={t.description}>
                        {t.description || "—"}
                        {t.referenceText && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">{t.referenceText}</span>
                        )}
                      </span>
                      <span className="font-medium tabular-nums">
                        {t.debitMinor !== undefined
                          ? `− ${formatMinor(t.debitMinor, t.currency)}`
                          : `+ ${formatMinor(t.creditMinor ?? 0, t.currency)}`}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )}

        {phase.name === "select" && phase.parsed.kind === "chat" && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Choose the messages to add</legend>
            {phase.parsed.facts.size === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payment details, identifiers or payment requests were found in this chat.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {phase.parsed.messages
                  .filter((m) => phase.parsed.kind === "chat" && phase.parsed.facts.has(m.index))
                  .map((m) => {
                    const facts = phase.parsed.kind === "chat" ? (phase.parsed.facts.get(m.index) ?? []) : []
                    return (
                      <li key={m.index} className="flex items-start gap-3 p-2.5">
                        <Checkbox
                          id={`msg-${m.index}`}
                          checked={chosen.has(String(m.index))}
                          onCheckedChange={(c) => toggle(String(m.index), c === true)}
                          className="mt-0.5"
                        />
                        <label htmlFor={`msg-${m.index}`} className="min-w-0 flex-1 space-y-1 text-sm">
                          <span className="block text-xs text-muted-foreground">
                            Message {m.index}
                            {m.at && ` · ${formatDateTime(m.at)}`}
                          </span>
                          <span className="block truncate text-muted-foreground" title={m.text}>
                            {m.text}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {facts.map((f) => (
                              <span key={f.factKey} className="rounded-full border bg-muted px-2 py-0.5 text-[11px]">
                                {FACT_TYPE_LABELS[f.factType]}:{" "}
                                {f.factType === "message_event"
                                  ? f.rawValue
                                  : f.factType === "amount" && f.amountMinor
                                    ? formatMinor(f.amountMinor)
                                    : maskValue(f.factType, f.normalizedValue)}
                              </span>
                            ))}
                          </span>
                        </label>
                      </li>
                    )
                  })}
              </ul>
            )}
          </fieldset>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => reset(false)}>
            Cancel
          </Button>
          {(phase.name === "consent" || phase.name === "error") && (
            <Button type="button" onClick={parse}>
              {phase.name === "error" ? "Try again" : "Read file"}
            </Button>
          )}
          {phase.name === "unsupported" && (
            <Button type="button" variant="secondary" onClick={submit} disabled={sending}>
              {sending && <Loader2 aria-hidden className="animate-spin" />}
              Mark as not readable
            </Button>
          )}
          {phase.name === "select" && (
            <Button type="button" onClick={submit} disabled={sending || chosen.size === 0}>
              {sending && <Loader2 aria-hidden className="animate-spin" />}
              Add {chosen.size}{" "}
              {phase.parsed.kind === "chat" ? (chosen.size === 1 ? "message" : "messages") : chosen.size === 1 ? "line" : "lines"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
