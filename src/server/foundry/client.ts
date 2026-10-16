import "server-only"

import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity"
import OpenAI from "openai"

import type { AnalysisEngine } from "@/types"

/**
 * Microsoft Foundry connection, configured entirely from environment variables.
 *
 * FOUNDRY_ENDPOINT    Any of these forms for the same Foundry resource:
 *                       https://<resource>.services.ai.azure.com/api/projects/<project>   (project endpoint)
 *                       https://<resource>.services.ai.azure.com/openai/v1/
 *                       https://<resource>.openai.azure.com/openai/v1/
 *                     Model deployments belong to the resource, so all are normalised to the
 *                     resource's OpenAI v1 endpoint, which accepts both API keys and Entra ID.
 * FOUNDRY_DEPLOYMENT  Model deployment name, e.g. gpt-5.4-mini
 * FOUNDRY_API_KEY     Optional. When unset, Microsoft Entra ID (DefaultAzureCredential:
 *                     `az login` locally, managed identity in Azure) is used.
 * FOUNDRY_TIMEOUT_MS  Per-call timeout (1 000 – 600 000, default 60 000).
 * ANALYSIS_ENGINE     "auto" (default: Foundry when configured), "foundry" or "mock".
 */
export interface FoundryConfig {
  endpoint: string
  deployment: string
  auth: "api-key" | "entra-id"
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 60_000
const ENGINES = ["auto", "foundry", "mock"]
const ENTRA_SCOPE = "https://cognitiveservices.azure.com/.default"

const warned = new Set<string>()
/** Logs each configuration problem once per process. Never includes configured values. */
function warnOnce(message: string) {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[foundry] ${message}`)
}

/** Maps any supported endpoint form to the resource's OpenAI v1 base URL, or undefined if unusable. */
export function normalizeEndpoint(raw: string): string | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.protocol !== "https:") return undefined
  const path = url.pathname.replace(/\/+$/, "")
  const supported =
    path === "" || path === "/openai" || path === "/openai/v1" || /^\/api\/projects\/[^/]+(\/openai\/v1)?$/.test(path)
  return supported ? `${url.origin}/openai/v1/` : undefined
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS
  const ms = Number(raw)
  if (!Number.isInteger(ms) || ms < 1_000 || ms > 600_000) {
    warnOnce(`FOUNDRY_TIMEOUT_MS must be an integer between 1000 and 600000; using ${DEFAULT_TIMEOUT_MS}.`)
    return DEFAULT_TIMEOUT_MS
  }
  return ms
}

export function getFoundryConfig(): FoundryConfig | undefined {
  let mode = (process.env.ANALYSIS_ENGINE ?? "auto").trim().toLowerCase() || "auto"
  if (!ENGINES.includes(mode)) {
    warnOnce(`ANALYSIS_ENGINE must be one of ${ENGINES.join(", ")}; treating it as "auto".`)
    mode = "auto"
  }
  if (mode === "mock") return undefined

  const rawEndpoint = process.env.FOUNDRY_ENDPOINT?.trim()
  const deployment = process.env.FOUNDRY_DEPLOYMENT?.trim()
  // In auto mode an empty endpoint is the normal "templates only" setup; anything half-configured is worth a warning.
  if (!rawEndpoint && !deployment && mode === "auto") return undefined
  if (!rawEndpoint || !deployment) {
    warnOnce(`FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT are both required; using template agents.`)
    return undefined
  }
  const endpoint = normalizeEndpoint(rawEndpoint)
  if (!endpoint) {
    warnOnce("FOUNDRY_ENDPOINT is not a supported https Foundry endpoint (see .env.example); using template agents.")
    return undefined
  }
  return {
    endpoint,
    deployment,
    auth: process.env.FOUNDRY_API_KEY?.trim() ? "api-key" : "entra-id",
    timeoutMs: parseTimeout(process.env.FOUNDRY_TIMEOUT_MS),
  }
}

export function configuredEngine(): AnalysisEngine {
  return getFoundryConfig() ? "foundry" : "mock"
}

// One client per process; Entra tokens are fetched (and refreshed) per request.
const globalForFoundry = globalThis as unknown as { foundryClient?: { key: string; client: OpenAI } }

export function getFoundryClient(config: FoundryConfig): OpenAI {
  const key = `${config.endpoint}|${config.auth}|${config.timeoutMs}`
  const cached = globalForFoundry.foundryClient
  if (cached?.key === key) return cached.client

  const apiKey =
    config.auth === "api-key"
      ? process.env.FOUNDRY_API_KEY!.trim()
      : getBearerTokenProvider(new DefaultAzureCredential(), ENTRA_SCOPE)
  const client = new OpenAI({ baseURL: config.endpoint, apiKey, timeout: config.timeoutMs, maxRetries: 1 })
  globalForFoundry.foundryClient = { key, client }
  return client
}

/* ------------------------------------------------------------------ */
/* Error reporting                                                     */
/* ------------------------------------------------------------------ */

export type FoundryFailure =
  | "timeout"
  | "network"
  | "auth"
  | "deployment_not_found"
  | "rate_limited"
  | "content_filter"
  | "bad_request"
  | "server_error"
  | "invalid_output"
  | "unknown"

const FAILURE_TEXT: Record<FoundryFailure, string> = {
  timeout: "The request timed out",
  network: "Could not reach Microsoft Foundry",
  auth: "Microsoft Foundry rejected the credentials",
  deployment_not_found: "The configured model deployment was not found",
  rate_limited: "Microsoft Foundry rate limit reached",
  content_filter: "The request was blocked by the content filter",
  bad_request: "Microsoft Foundry rejected the request",
  server_error: "Microsoft Foundry returned a server error",
  invalid_output: "The model returned output that failed validation",
  unknown: "Unexpected error",
}

/**
 * Classifies a failed Foundry call without exposing its raw message, which may echo
 * request content. Safe to log and to show to the user.
 */
export function describeFoundryError(error: unknown): { kind: FoundryFailure; status?: number; message: string } {
  let kind: FoundryFailure = "unknown"
  let status: number | undefined
  if (error instanceof OpenAI.APIConnectionTimeoutError) kind = "timeout"
  else if (error instanceof OpenAI.APIConnectionError) kind = "network"
  else if (error instanceof OpenAI.APIError) {
    status = error.status
    const code = typeof error.code === "string" ? error.code : ""
    if (status === 401 || status === 403) kind = "auth"
    else if (status === 404) kind = "deployment_not_found"
    else if (status === 429) kind = "rate_limited"
    else if (status === 408) kind = "timeout"
    else if (code === "content_filter") kind = "content_filter"
    else if (status !== undefined && status >= 500) kind = "server_error"
    else if (status !== undefined && status >= 400) kind = "bad_request"
  } else if (error instanceof Error && error.name === "FoundryAgentError") kind = "invalid_output"
  else if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) kind = "timeout"
  return { kind, status, message: `${FAILURE_TEXT[kind]}${status ? ` (HTTP ${status})` : ""}` }
}
