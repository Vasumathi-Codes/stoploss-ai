import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  FileEdit,
  FlaskConical,
  Info,
  Loader2,
  type LucideIcon,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react"

import { AGENT_STATUSES, CASE_STATUSES, FINDING_SOURCES, PRIORITIES } from "@/lib/config/taxonomy"
import { cn } from "@/lib/utils"
import { TONE_BADGE, type Tone } from "@/lib/utils/tone"
import type { ActionItem, AgentStatus, CaseStatus, FindingSource } from "@/types"

interface ToneBadgeProps {
  tone: Tone
  icon?: LucideIcon
  spin?: boolean
  children: React.ReactNode
  className?: string
  title?: string
}

/** Pill with icon + text so status never relies on colour alone. */
export function ToneBadge({ tone, icon: Icon, spin, children, className, title }: ToneBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_BADGE[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className={cn("size-3.5", spin && "motion-safe:animate-spin")} />}
      {children}
    </span>
  )
}

const CASE_ICONS: Record<CaseStatus, LucideIcon> = {
  draft: FileEdit,
  reported: CircleDot,
  analysis_in_progress: Loader2,
  action_plan_ready: Sparkles,
  user_action_required: AlertTriangle,
  reporting_in_progress: Send,
  resolved: CheckCircle2,
  archived: Archive,
}

export function CaseStatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const meta = CASE_STATUSES[status]
  const tone: Tone = meta.tone
  return (
    <ToneBadge
      tone={tone}
      icon={CASE_ICONS[status]}
      spin={status === "analysis_in_progress"}
      className={className}
      title={meta.description}
    >
      {meta.label}
    </ToneBadge>
  )
}

const AGENT_ICONS: Record<AgentStatus, LucideIcon> = {
  not_started: CircleDashed,
  analyzing: Loader2,
  awaiting_information: AlertTriangle,
  completed: CheckCircle2,
  needs_review: Info,
}

export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  const meta = AGENT_STATUSES[status]
  return (
    <ToneBadge tone={meta.tone} icon={AGENT_ICONS[status]} spin={status === "analyzing"} className={className}>
      {meta.label}
    </ToneBadge>
  )
}

export function PriorityBadge({ action, className }: { action: Pick<ActionItem, "priority" | "status">; className?: string }) {
  if (action.status === "completed") {
    return (
      <ToneBadge tone="success" icon={CheckCircle2} className={className}>
        {PRIORITIES.completed.label}
      </ToneBadge>
    )
  }
  const map = {
    urgent: { tone: "danger" as Tone, icon: Zap },
    high: { tone: "warning" as Tone, icon: AlertTriangle },
    normal: { tone: "muted" as Tone, icon: Circle },
  }
  const { tone, icon } = map[action.priority]
  return (
    <ToneBadge tone={tone} icon={icon} className={className}>
      {PRIORITIES[action.priority].label}
    </ToneBadge>
  )
}

const SOURCE_META: Record<FindingSource, { tone: Tone; icon: LucideIcon }> = {
  mock_analysis: { tone: "primary", icon: FlaskConical },
  ai_analysis: { tone: "primary", icon: Sparkles },
  user_supplied: { tone: "info", icon: User },
  verified_guidance: { tone: "success", icon: ShieldCheck },
  unverified_assumption: { tone: "warning", icon: AlertTriangle },
}

export function FindingSourceBadge({ source, className }: { source: FindingSource; className?: string }) {
  const meta = FINDING_SOURCES[source]
  const { tone, icon } = SOURCE_META[source]
  return (
    <ToneBadge tone={tone} icon={icon} className={className} title={meta.description}>
      {meta.label}
    </ToneBadge>
  )
}

export function DemoDataBadge({ className, label = "Fictional demo data" }: { className?: string; label?: string }) {
  return (
    <ToneBadge tone="muted" icon={FlaskConical} className={className}>
      {label}
    </ToneBadge>
  )
}
