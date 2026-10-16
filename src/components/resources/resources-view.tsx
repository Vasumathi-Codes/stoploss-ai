"use client"

import { useMemo, useState } from "react"
import { BookOpen, Clock } from "lucide-react"

import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/states"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LEARNING_CATEGORIES, LEARNING_RESOURCES } from "@/lib/config/learning-resources"
import { cn } from "@/lib/utils"
import type { LearningCategory } from "@/types"

type Filter = LearningCategory | "all"

export function ResourcesView() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Filter>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return LEARNING_RESOURCES.filter(
      (r) =>
        (category === "all" || r.category === category) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.points.some((p) => p.toLowerCase().includes(q))),
    )
  }, [query, category])

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: "All topics" },
    ...(Object.keys(LEARNING_CATEGORIES) as LearningCategory[]).map((c) => ({ value: c, label: LEARNING_CATEGORIES[c] })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resources"
        description="Short, practical guides. General information only — not legal or financial advice, and no guarantees about outcomes."
      />

      <div className="space-y-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides"
          aria-label="Search guides"
          className="h-9 max-w-md"
        />
        <div role="group" aria-label="Filter by topic" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                category === c.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50 hover:bg-accent/40",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No guides match" description="Try a different word or topic." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id} className="grid">
              <Card className="gap-3 p-5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-primary">{LEARNING_CATEGORIES[r.category]}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="size-3" />
                    {r.readMinutes} min read
                  </span>
                </div>
                <h2 className="text-base leading-snug font-semibold">{r.title}</h2>
                <p className="text-sm text-muted-foreground">{r.summary}</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {r.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Content is maintained in one configuration file and should be reviewed by qualified people before production use.
      </p>
    </div>
  )
}
