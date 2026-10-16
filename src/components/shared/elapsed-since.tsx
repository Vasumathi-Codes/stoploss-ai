"use client"

import { useSyncExternalStore } from "react"

import { formatElapsed } from "@/lib/utils/format"

function subscribe(cb: () => void) {
  const id = setInterval(cb, 30_000)
  return () => clearInterval(id)
}

// Minute resolution keeps the snapshot stable between ticks.
const getSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000
const getServerSnapshot = () => null

/** Elapsed time since an instant. Renders only on the client to avoid hydration drift. */
export function ElapsedSince({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (now === null) return <span className="text-muted-foreground">—</span>
  return <span className="tabular-nums">{formatElapsed(iso, now)}</span>
}
