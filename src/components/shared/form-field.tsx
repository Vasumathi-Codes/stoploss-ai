import { AlertCircle } from "lucide-react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  id: string
  label: string
  hint?: React.ReactNode
  error?: string
  optional?: boolean
  className?: string
  children: React.ReactNode
  /** Use for radio groups etc. where a <label for> doesn't apply. */
  asFieldset?: boolean
}

export function fieldA11y(id: string, error?: string, hint?: boolean) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ")
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy || undefined }
}

export function FormField({ id, label, hint, error, optional, className, children, asFieldset }: FormFieldProps) {
  const labelContent = (
    <>
      {label}
      {optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>}
    </>
  )
  const body = (
    <>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </>
  )
  if (asFieldset) {
    return (
      <fieldset className={cn("space-y-2", className)} aria-describedby={hint ? `${id}-hint` : undefined}>
        <legend className="mb-2 text-sm font-medium">{labelContent}</legend>
        {body}
      </fieldset>
    )
  }
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{labelContent}</Label>
      {body}
    </div>
  )
}
