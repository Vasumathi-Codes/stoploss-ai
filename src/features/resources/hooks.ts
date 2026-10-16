"use client"

import { useAppStore } from "@/lib/store/app-store"

/** Official reporting channels, served from the database. */
export function useOfficialResources() {
  return useAppStore((s) => s.resources)
}

export function useOfficialResource(id: string | undefined) {
  return useAppStore((s) => (id ? s.resources.find((r) => r.id === id) : undefined))
}
