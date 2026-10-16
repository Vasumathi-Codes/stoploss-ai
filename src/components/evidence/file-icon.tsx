import { File, FileImage, FileText, FileType2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { EvidenceKind } from "@/types"

const ICONS = { image: FileImage, pdf: FileType2, text: FileText, other: File } as const
const TONES: Record<EvidenceKind, string> = {
  image: "bg-info/15 text-info",
  pdf: "bg-destructive/12 text-destructive",
  text: "bg-success/15 text-success",
  other: "bg-muted text-muted-foreground",
}

export function kindFromMime(mime: string): EvidenceKind {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/plain") return "text"
  return "other"
}

export function FileIcon({ kind, className }: { kind: EvidenceKind; className?: string }) {
  const Icon = ICONS[kind]
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[kind], className)}>
      <Icon aria-hidden className="size-5" />
    </span>
  )
}
