"use client"

import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

/**
 * Non-sensitive UI preferences only. This is the ONLY persisted store; incident
 * data and evidence are never written to browser storage.
 */
export interface UiPreferences {
  sidebarCollapsed: boolean
  notifyAgentUpdates: boolean
  notifyTaskReminders: boolean
  confirmExternalLinks: boolean
  toggleSidebar: () => void
  setPreference: <K extends PreferenceKey>(key: K, value: UiPreferences[K]) => void
}

type PreferenceKey = "sidebarCollapsed" | "notifyAgentUpdates" | "notifyTaskReminders" | "confirmExternalLinks"

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      /* storage unavailable — preferences just won't persist */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name)
    } catch {
      /* ignore */
    }
  },
}

export const useUiPreferences = create<UiPreferences>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      notifyAgentUpdates: true,
      notifyTaskReminders: true,
      confirmExternalLinks: true,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPreference: (key, value) => set({ [key]: value } as Partial<UiPreferences>),
    }),
    {
      name: "stoploss-ui-preferences",
      storage: createJSONStorage(() => safeStorage),
      // Rehydrated after mount (see Providers) so SSR and first client render match.
      skipHydration: true,
      partialize: ({ sidebarCollapsed, notifyAgentUpdates, notifyTaskReminders, confirmExternalLinks }) => ({
        sidebarCollapsed,
        notifyAgentUpdates,
        notifyTaskReminders,
        confirmExternalLinks,
      }),
    },
  ),
)
