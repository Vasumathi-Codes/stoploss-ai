import type { Currency } from "@/types"

/**
 * All dates are formatted in a fixed time zone so server and client render the
 * same text (no hydration mismatches) and the demo reads consistently.
 */
const TIME_ZONE = "Asia/Kolkata"

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
})

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
})

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
})

export function formatDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso))
}

export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso))
}

const currencyFmts = new Map<Currency, Intl.NumberFormat>()

export function formatCurrency(amount: number, currency: Currency = "INR") {
  let fmt = currencyFmts.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    })
    currencyFmts.set(currency, fmt)
  }
  return fmt.format(amount)
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Elapsed duration between two instants, e.g. "3 h 12 min". */
export function formatElapsed(fromIso: string, toMs: number) {
  const mins = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 60000))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const rest = mins % 60
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${rest} min`
  return `${rest} min`
}

export function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}
