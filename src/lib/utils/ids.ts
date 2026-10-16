export function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}

/** Human-readable case reference: SL-YYMM-NNNN, unique among `existing`. */
export function createCaseReference(existing: Set<string>, date = new Date()) {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  for (let i = 0; i < 50; i++) {
    const n = String(Math.floor(1000 + Math.random() * 9000))
    const ref = `SL-${yy}${mm}-${n}`
    if (!existing.has(ref)) return ref
  }
  return `SL-${yy}${mm}-${Date.now().toString().slice(-6)}`
}
