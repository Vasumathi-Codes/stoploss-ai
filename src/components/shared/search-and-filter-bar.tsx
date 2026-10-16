"use client"

import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface FilterDef {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

interface SearchAndFilterBarProps {
  query: string
  onQueryChange: (q: string) => void
  placeholder: string
  filters?: FilterDef[]
  trailing?: React.ReactNode
  className?: string
}

export const ALL = "all"

export function SearchAndFilterBar({
  query,
  onQueryChange,
  placeholder,
  filters = [],
  trailing,
  className,
}: SearchAndFilterBarProps) {
  const active = query.length > 0 || filters.some((f) => f.value !== ALL)
  return (
    <div className={cn("flex flex-col gap-2 lg:flex-row lg:items-center", className)} role="search">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Select key={f.id} value={f.value} onValueChange={f.onChange}>
            <SelectTrigger className="h-9 min-w-[150px] flex-1 sm:flex-none" aria-label={f.label}>
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All {f.label.toLowerCase()}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              onQueryChange("")
              filters.forEach((f) => f.onChange(ALL))
            }}
          >
            <X aria-hidden />
            Clear
          </Button>
        )}
        {trailing}
      </div>
    </div>
  )
}
