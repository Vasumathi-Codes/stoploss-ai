import { Pencil } from "lucide-react"

import { FileIcon } from "@/components/evidence/file-icon"
import { Button } from "@/components/ui/button"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"
import { formatCurrency, formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { Currency, EvidenceKind, FraudCategory, TriState } from "@/types"

const TRI_LABEL: Record<TriState, string> = { yes: "Yes", no: "No", unsure: "Not sure" }

export interface IncidentSummaryData {
  category: FraudCategory
  title?: string
  description: string
  amount: number
  currency: Currency
  occurredAt: string
  paymentMethod: string
  transactionRef?: string
  hasAccountAccess: TriState
  ongoing?: TriState
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  )
}

export function IncidentSummary({
  data,
  files,
  onEditDetails,
  onEditEvidence,
}: {
  data: IncidentSummaryData
  files: { name: string; kind: EvidenceKind; size: number }[]
  onEditDetails?: () => void
  onEditEvidence?: () => void
}) {
  return (
    <div className="space-y-4">
      <Section title="What happened" onEdit={onEditDetails}>
        <dl className="space-y-3">
          <Row label="Type of fraud" value={FRAUD_CATEGORIES[data.category].label} />
          <Row
            label="Case name"
            value={data.title || <span className="text-muted-foreground">Not provided — we&apos;ll use the fraud type</span>}
          />
          <Row label="Description" value={<span className="whitespace-pre-line">{data.description}</span>} />
          <Row label="Approximate amount" value={formatCurrency(data.amount, data.currency)} />
          <Row label="When" value={formatDateTime(data.occurredAt)} />
          <Row label="Payment method / platform" value={data.paymentMethod} />
          <Row
            label="Transaction reference"
            value={data.transactionRef || <span className="text-muted-foreground">Not provided</span>}
          />
          <Row label="Still have account access?" value={TRI_LABEL[data.hasAccountAccess]} />
          <Row
            label="Still happening?"
            value={data.ongoing ? TRI_LABEL[data.ongoing] : <span className="text-muted-foreground">Not answered</span>}
          />
        </dl>
      </Section>
      <Section title="Evidence" onEdit={onEditEvidence}>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files added. You can add evidence later from the case page.</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-3">
                <FileIcon kind={f.kind} className="size-8" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
