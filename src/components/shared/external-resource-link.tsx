"use client"

import { useState } from "react"
import { ExternalLink, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { useUiPreferences } from "@/lib/store/ui-preferences"
import type { OfficialResource } from "@/types"

type ButtonProps = React.ComponentProps<typeof Button>

interface Props {
  resource: OfficialResource
  label?: string
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
  className?: string
}

/**
 * Opens an official resource safely: new tab, noopener/noreferrer, and an
 * optional "you are leaving STOPLOSS AI" confirmation (Settings → external links).
 * Opening a link never marks any task complete.
 */
export function ExternalResourceLink({ resource, label, variant = "outline", size = "sm", className }: Props) {
  const confirmExternal = useUiPreferences((s) => s.confirmExternalLinks)
  const [open, setOpen] = useState(false)

  if (resource.phone) {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <a href={`tel:${resource.phone}`} aria-label={`Call ${resource.name} on ${resource.phone}`}>
          <Phone aria-hidden />
          {label ?? `Call ${resource.phone}`}
        </a>
      </Button>
    )
  }

  if (!resource.url) {
    return null
  }

  const openLink = () => window.open(resource.url, "_blank", "noopener,noreferrer")

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => (confirmExternal ? setOpen(true) : openLink())}
        aria-label={`${label ?? "Open"} ${resource.name} (opens an external site in a new tab)`}
      >
        <ExternalLink aria-hidden />
        {label ?? "Open resource"}
      </Button>
      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="You're opening an external site"
        description={
          <>
            <p>
              <span className="font-medium text-foreground">{resource.name}</span> will open in a new tab at{" "}
              <span className="font-mono text-foreground">{resource.url}</span>.
            </p>
            <p>
              STOPLOSS AI does not represent this organisation. Check the address in your browser before entering any information.
              This link has not yet been verified by the STOPLOSS AI team.
            </p>
          </>
        }
        confirmLabel="Open in new tab"
        onConfirm={openLink}
      />
    </>
  )
}
