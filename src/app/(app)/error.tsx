"use client"

import { ErrorState } from "@/components/shared/states"
import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong on this page"
      description="Your saved cases are safe. Try again, or go back to the dashboard."
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">Dashboard</a>
          </Button>
        </div>
      }
    />
  )
}
