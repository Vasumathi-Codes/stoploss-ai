"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderOpen, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useIncidents } from "@/features/cases/hooks"
import { MAIN_NAV, SECONDARY_NAV } from "@/lib/config/navigation"
import { FRAUD_CATEGORIES } from "@/lib/config/taxonomy"

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const incidents = useIncidents()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-9 justify-start gap-2 px-0 text-muted-foreground sm:w-56 sm:px-3 md:w-64"
        aria-label="Search cases and pages"
      >
        <Search aria-hidden className="mx-auto sm:mx-0" />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search cases, pages…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search cases and pages">
        <CommandInput placeholder="Search by case reference, title or page…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Cases">
            {incidents.map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.reference} ${i.title} ${FRAUD_CATEGORIES[i.category].label}`}
                onSelect={() => go(`/cases/${i.id}`)}
              >
                <FolderOpen aria-hidden />
                <span className="truncate">{i.title}</span>
                <CommandShortcut>{i.reference}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Pages">
            {[...MAIN_NAV, ...SECONDARY_NAV].map((item) => (
              <CommandItem key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)}>
                <item.icon aria-hidden />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
