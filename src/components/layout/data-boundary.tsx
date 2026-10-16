"use client"

import { useEffect, useState } from "react"
import { DatabaseZap, RotateCw } from "lucide-react"

import { ErrorState, LoadingState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"
import { demoService } from "@/lib/services"
import { useAppStore } from "@/lib/store/app-store"

/** Loads the user's data from the server before rendering the workspace. */
export function DataBoundary({ children }: { children: React.ReactNode }) {
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void demoService.refresh().catch(() => undefined)
  }, [])

  const retry = async () => {
    setRetrying(true)
    await demoService.refresh().catch(() => undefined)
    setRetrying(false)
  }

  return (
    <>
      {status === "loading" && <LoadingState label="Loading your cases…" rows={4} />}
      {status === "error" && (
        <ErrorState
          icon={DatabaseZap}
          title="We couldn't load your cases"
          description={error ?? "The server didn't respond. Your data is safe — please try again."}
          action={
            <Button onClick={() => void retry()} disabled={retrying}>
              <RotateCw aria-hidden className={retrying ? "motion-safe:animate-spin" : undefined} />
              Try again
            </Button>
          }
        />
      )}
      {/* Always rendered (so the route segment renders on the server), shown once data is in. */}
      <div hidden={status !== "ready"}>{children}</div>
    </>
  )
}
