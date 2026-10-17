"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { MAX_CHAT_CHARS } from "@/lib/evidence/chat-parser"
import type { LocalEvidenceFile } from "@/lib/services"

export const ACCEPTED_TYPES: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "application/pdf": "PDF",
  "text/plain": "TXT",
}
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.pdf,.txt,image/png,image/jpeg,application/pdf,text/plain"
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES = 10

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  txt: "text/plain",
}

export interface PendingFile extends LocalEvidenceFile {
  id: string
  /** Simulated local "upload" progress, 0–100. Nothing is transmitted. */
  progress: number
}

export interface RejectedFile {
  name: string
  reason: string
}

function resolveMime(file: File) {
  if (ACCEPTED_TYPES[file.type]) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return EXT_TO_MIME[ext]
}

/**
 * Holds files picked in the browser. Object URLs are revoked when files are
 * removed or the component unmounts, unless ownership was handed to the demo
 * store with `release()`.
 */
export function useLocalFiles() {
  const [files, setFiles] = useState<PendingFile[]>([])
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const filesRef = useRef<PendingFile[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>())

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((t) => clearInterval(t))
      filesRef.current.forEach((f) => f.objectUrl && URL.revokeObjectURL(f.objectUrl))
    }
  }, [])

  const simulateProgress = useCallback((id: string) => {
    const timer = setInterval(() => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: Math.min(100, f.progress + 20) } : f)))
    }, 160)
    timers.current.set(id, timer)
    setTimeout(() => {
      clearInterval(timer)
      timers.current.delete(id)
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: 100 } : f)))
    }, 900)
  }, [])

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const accepted: PendingFile[] = []
      const rejects: RejectedFile[] = []
      const existing = filesRef.current
      for (const file of incoming) {
        const mime = resolveMime(file)
        if (!mime) {
          rejects.push({ name: file.name, reason: "Unsupported format. Use PNG, JPEG, PDF or TXT." })
          continue
        }
        if (file.size > MAX_FILE_BYTES) {
          rejects.push({ name: file.name, reason: "Larger than 10 MB." })
          continue
        }
        if (file.size === 0) {
          rejects.push({ name: file.name, reason: "The file is empty." })
          continue
        }
        if (existing.length + accepted.length >= MAX_FILES) {
          rejects.push({ name: file.name, reason: `You can add up to ${MAX_FILES} files at a time.` })
          continue
        }
        if (existing.some((f) => f.file.name === file.name && f.file.size === file.size)) {
          rejects.push({ name: file.name, reason: "Already added." })
          continue
        }
        const normalized = mime === file.type ? file : new File([file], file.name, { type: mime })
        // Kept in this tab only; long enough for Evidence Intelligence to read a chat export.
        const textPreview = mime === "text/plain" ? await normalized.slice(0, MAX_CHAT_CHARS).text() : undefined
        const objectUrl = mime.startsWith("image/") || mime === "application/pdf" ? URL.createObjectURL(normalized) : undefined
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file: normalized,
          objectUrl,
          textPreview,
          progress: 0,
        })
      }
      setRejected(rejects)
      if (accepted.length) {
        setFiles((prev) => [...prev, ...accepted])
        accepted.forEach((f) => simulateProgress(f.id))
      }
      return { accepted: accepted.length, rejected: rejects }
    },
    [simulateProgress],
  )

  const removeFile = useCallback((id: string) => {
    const target = filesRef.current.find((f) => f.id === id)
    if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl)
    const timer = timers.current.get(id)
    if (timer) clearInterval(timer)
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  /** Hand files over (e.g. to the demo store) without revoking their URLs. */
  const release = useCallback((): LocalEvidenceFile[] => {
    const out = filesRef.current.map(({ file, objectUrl, textPreview }) => ({ file, objectUrl, textPreview }))
    filesRef.current = []
    setFiles([])
    setRejected([])
    return out
  }, [])

  const ready = files.every((f) => f.progress >= 100)

  return { files, rejected, addFiles, removeFile, release, ready, clearRejected: () => setRejected([]) }
}
