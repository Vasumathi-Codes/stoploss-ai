export type Tone = "neutral" | "muted" | "primary" | "info" | "success" | "warning" | "danger"

/** Token-based tone classes for badges, icons and accents. */
export const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground border-border",
  muted: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/12 text-primary border-primary/25",
  info: "bg-info/12 text-info border-info/25",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/30",
}

export const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
}

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-foreground/40",
  muted: "bg-muted-foreground/60",
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
}
