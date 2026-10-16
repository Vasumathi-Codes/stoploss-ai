import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  back?: { href: string; label: string }
  eyebrow?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, back, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {back && (
          <Link
            href={back.href}
            className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({
  title,
  description,
  action,
  id,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  id?: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-0.5">
        <h2 id={id} className="text-base font-semibold tracking-tight md:text-lg">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
