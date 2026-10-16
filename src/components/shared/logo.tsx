import { cn } from "@/lib/utils"

/** Shield with an abstract rupee mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <defs>
        <linearGradient id="sl-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.7 0.19 293)" />
          <stop offset="1" stopColor="oklch(0.5 0.22 280)" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 27 6.6v8.2c0 7-4.6 12.3-11 14.7C9.6 27.1 5 21.8 5 14.8V6.6L16 2.5Z" fill="url(#sl-shield)" />
      <path
        d="M11.5 10.5h9M11.5 14h9M15 10.5c2.8 0 4.3 1.2 4.3 3.5s-1.6 3.5-4.3 3.5h-2.2l5.4 5.5"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-8 shrink-0" />
      {!collapsed && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">
            STOPLOSS <span className="text-primary">AI</span>
          </span>
          <span className="mt-1 text-[10.5px] text-muted-foreground">Fraud response guide</span>
        </span>
      )}
    </span>
  )
}
