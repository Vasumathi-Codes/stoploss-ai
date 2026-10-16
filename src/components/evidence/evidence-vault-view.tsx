"use client"

import { useMemo, useState } from "react"
import { Copy, LayoutGrid, List, Lock, Package, Vault } from "lucide-react"
import { toast } from "sonner"

import { AddEvidenceDialog } from "@/components/evidence/add-evidence-dialog"
import { EvidenceCard } from "@/components/evidence/evidence-card"
import { FileIcon } from "@/components/evidence/file-icon"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, SearchAndFilterBar } from "@/components/shared/search-and-filter-bar"
import { EmptyState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIncidents } from "@/features/cases/hooks"
import { useEvidence } from "@/features/evidence/hooks"
import { EVIDENCE_KINDS } from "@/lib/config/taxonomy"
import { formatDateTime, formatFileSize } from "@/lib/utils/format"
import type { EvidenceKind } from "@/types"

export function EvidenceVaultView() {
  const evidence = useEvidence()
  const incidents = useIncidents()
  const byId = useMemo(() => new Map(incidents.map((i) => [i.id, i])), [incidents])
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState(ALL)
  const [caseId, setCaseId] = useState(ALL)
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [packageOpen, setPackageOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return evidence.filter(
      (e) =>
        (kind === ALL || e.kind === kind) &&
        (caseId === ALL || e.incidentId === caseId) &&
        (!q || e.name.toLowerCase().includes(q) || byId.get(e.incidentId)?.reference.toLowerCase().includes(q)),
    )
  }, [evidence, kind, caseId, query, byId])

  // Drop selections for items that were removed.
  const selectedItems = evidence.filter((e) => selected.has(e.id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const packageText = () =>
    [
      "STOPLOSS AI — demo evidence package preview (not validated)",
      ...selectedItems.map((e) => {
        const inc = byId.get(e.incidentId)
        return `- ${e.name} | ${e.mimeType} | ${formatFileSize(e.size)} | added ${formatDateTime(e.addedAt)} | case ${inc?.reference ?? "?"}`
      }),
    ].join("\n")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence Vault"
        description="All evidence across your demo cases. Search, preview and assemble a package overview."
        actions={<AddEvidenceDialog />}
      />

      <aside className="grid gap-3 rounded-xl border bg-card p-4 text-sm md:grid-cols-[auto_1fr] md:gap-4 md:p-5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-info/15 text-info">
          <Lock aria-hidden className="size-5" />
        </span>
        <div className="space-y-1.5">
          <p className="font-medium">How evidence is handled in this demo</p>
          <ul className="grid list-disc gap-x-6 gap-y-1 pl-5 text-muted-foreground md:grid-cols-2">
            <li>Only each file&apos;s name, type and size is saved with your case.</li>
            <li>The files themselves stay on your device and are never uploaded.</li>
            <li>Previews work only in the tab where you added the file.</li>
            <li>Production needs secure storage, access control, encryption and retention policies.</li>
          </ul>
        </div>
      </aside>

      <SearchAndFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search by file name or case reference"
        filters={[
          {
            id: "kind",
            label: "Types",
            value: kind,
            onChange: setKind,
            options: (Object.keys(EVIDENCE_KINDS) as EvidenceKind[]).map((k) => ({ value: k, label: EVIDENCE_KINDS[k].label })),
          },
          {
            id: "case",
            label: "Cases",
            value: caseId,
            onChange: setCaseId,
            options: incidents.map((i) => ({ value: i.id, label: i.reference })),
          },
        ]}
        trailing={
          <ToggleGroup
            type="single"
            variant="outline"
            value={layout}
            onValueChange={(v) => v && setLayout(v as "grid" | "list")}
            aria-label="Layout"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" className="size-9">
              <LayoutGrid aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="size-9">
              <List aria-hidden />
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {evidence.length} items · {selectedItems.length} selected for package preview
        </p>
        <div className="flex gap-2">
          {selectedItems.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPackageOpen(true)} disabled={selectedItems.length === 0}>
            <Package aria-hidden />
            Preview evidence package
          </Button>
        </div>
      </div>

      {evidence.length === 0 ? (
        <EmptyState
          icon={Vault}
          title="No evidence yet"
          description="Add screenshots, PDFs or text files to a case."
          action={<AddEvidenceDialog />}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try another search or clear the filters." />
      ) : layout === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => (
            <li key={e.id}>
              <EvidenceCard
                item={e}
                incident={byId.get(e.incidentId)}
                selectable={{ selected: selected.has(e.id), onToggle: () => toggle(e.id) }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={e.id}>
              <EvidenceCard
                item={e}
                layout="list"
                incident={byId.get(e.incidentId)}
                selectable={{ selected: selected.has(e.id), onToggle: () => toggle(e.id) }}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Evidence package preview</DialogTitle>
            <DialogDescription>
              A local list of the selected items and their metadata. It has not been cryptographically validated and does not
              establish a legal chain of custody.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {selectedItems.map((e) => (
              <li key={e.id} className="flex items-center gap-3 p-3">
                <FileIcon kind={e.kind} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {byId.get(e.incidentId)?.reference} · {formatFileSize(e.size)} · added {formatDateTime(e.addedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  .writeText(packageText())
                  .then(() => toast.success("Package summary copied", { description: "Copied to your clipboard only." }))
                  .catch(() => toast.error("Couldn't access the clipboard"))
              }}
            >
              <Copy aria-hidden />
              Copy summary
            </Button>
            <Button onClick={() => setPackageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
