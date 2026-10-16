"use client"

import { useEffect } from "react"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useUiPreferences } from "@/lib/store/ui-preferences"

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void useUiPreferences.persist.rehydrate()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}
