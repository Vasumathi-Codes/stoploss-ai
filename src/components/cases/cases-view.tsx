"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FolderSearch, LayoutGrid, List, ShieldAlert } from "lucide-react"

import { IncidentCard } from "@/components/cases/incident-card"
import { PageHeader } from "@/components/shared/page-header"
import { ALL, SearchAndFilterBar } from "@/components/shared/search-and-filter-bar"
import { EmptyState } from "@/components/shared/states"
import { DemoDataBadge } from "@/components/shared/status-badges"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIncidents, useProgressByIncident } from "@/features/cases/hooks"
import { CASE_STATUSES, CASE_STATUS_IDS, FRAUD_CATEGORIES, FRAUD_CATEGORY_IDS } from "@/lib/config/taxonomy"

type SortKey = "updated" | "reported" | "amount"

export function CasesView() {
  const incidents = useIncidents()
  const progress = useProgressByIncident()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [sort, setSort] = useState<SortKey>("updated")
  const [layout, setLayout] = useState<"grid" | "list">("grid")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return incidents
      .filter((i) => (status === ALL ? i.status !== "archived" : i.status === status))
      .filter((i) => category === ALL || i.category === category)
      .filter((i) => !q || i.reference.toLowerCase().includes(q) || i.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "amount") return b.amount - a.amount
        if (sort === "reported") return b.reportedAt.localeCompare(a.reportedAt)
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }, [incidents, query, status, category, sort])

  const archivedCount = incidents.filter((i) => i.status === "archived").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<DemoDataBadge />}
        title="My Cases"
        description="Every incident you've reported in STOPLOSS AI. Statuses describe progress in this app, not the state of any bank or police process."
        actions={
          <Button asChild>
            <Link href="/incidents/new">
              <ShieldAlert aria-hidden />
              Report a New Fraud
            </Link>
          </Button>
        }
      />

      <SearchAndFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search by case reference or name"
        filters={[
          {
            id: "status",
            label: "Statuses",
            value: status,
            onChange: setStatus,
            options: CASE_STATUS_IDS.map((s) => ({ value: s, label: CASE_STATUSES[s].label })),
          },
          {
            id: "category",
            label: "Categories",
            value: category,
            onChange: setCategory,
            options: FRAUD_CATEGORY_IDS.map((c) => ({ value: c, label: FRAUD_CATEGORIES[c].short })),
          },
        ]}
        trailing={
          <>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Sort cases">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Latest update</SelectItem>
                <SelectItem value="reported">Date reported</SelectItem>
                <SelectItem value="amount">Amount (high to low)</SelectItem>
              </SelectContent>
            </Select>
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
          </>
        }
      />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {incidents.length} cases
        {status === ALL && archivedCount > 0 && ` · ${archivedCount} archived hidden (filter by “Archived” to see them)`}
      </p>

      {incidents.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title="No cases yet"
          description="When you report an incident, it will appear here with its action plan and evidence."
          action={
            <Button asChild>
              <Link href="/incidents/new">Report a New Fraud</Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title="No cases match your filters"
          description="Try a different search term or clear the filters."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("")
                setStatus(ALL)
                setCategory(ALL)
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : layout === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => (
            <li key={i.id} className="grid">
              <IncidentCard incident={i} progress={progress.get(i.id) ?? { done: 0, total: 0 }} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {filtered.map((i) => (
            <li key={i.id}>
              <IncidentCard incident={i} layout="list" progress={progress.get(i.id) ?? { done: 0, total: 0 }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
