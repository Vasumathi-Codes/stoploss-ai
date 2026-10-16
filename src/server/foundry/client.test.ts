import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"

import OpenAI from "openai"

import { FoundryAgentError } from "@/server/foundry/agents"
import { configuredEngine, describeFoundryError, getFoundryConfig, normalizeEndpoint } from "@/server/foundry/client"

const KEYS = ["ANALYSIS_ENGINE", "FOUNDRY_ENDPOINT", "FOUNDRY_DEPLOYMENT", "FOUNDRY_API_KEY", "FOUNDRY_TIMEOUT_MS"] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, values)
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("getFoundryConfig", () => {
  it("falls back to templates when Foundry isn't configured", () => {
    setEnv({})
    assert.equal(getFoundryConfig(), undefined)
    assert.equal(configuredEngine(), "mock")
  })

  it("uses Foundry automatically when endpoint and deployment are set", () => {
    setEnv({ FOUNDRY_ENDPOINT: "https://r.openai.azure.com/openai/v1", FOUNDRY_DEPLOYMENT: "gpt-mini" })
    const config = getFoundryConfig()
    assert.equal(config?.endpoint, "https://r.openai.azure.com/openai/v1/", "adds the trailing slash")
    assert.equal(config?.auth, "entra-id", "no key means Entra ID")
    assert.equal(configuredEngine(), "foundry")
  })

  it("uses the API key when one is set", () => {
    setEnv({ FOUNDRY_ENDPOINT: "https://r/openai/v1/", FOUNDRY_DEPLOYMENT: "d", FOUNDRY_API_KEY: "test-key" })
    assert.equal(getFoundryConfig()?.auth, "api-key")
  })

  it("ANALYSIS_ENGINE=mock forces templates even when configured", () => {
    setEnv({ ANALYSIS_ENGINE: "mock", FOUNDRY_ENDPOINT: "https://r/openai/v1/", FOUNDRY_DEPLOYMENT: "d" })
    assert.equal(getFoundryConfig(), undefined)
  })
})

describe("getFoundryConfig validation", () => {
  it("accepts a Foundry project endpoint and targets the resource's OpenAI v1 API", () => {
    setEnv({
      FOUNDRY_ENDPOINT: "https://my-foundry.services.ai.azure.com/api/projects/proj-default",
      FOUNDRY_DEPLOYMENT: "gpt-5.4-mini",
      FOUNDRY_API_KEY: "test-key",
      FOUNDRY_TIMEOUT_MS: "60000",
    })
    assert.deepEqual(getFoundryConfig(), {
      endpoint: "https://my-foundry.services.ai.azure.com/openai/v1/",
      deployment: "gpt-5.4-mini",
      auth: "api-key",
      timeoutMs: 60000,
    })
  })

  it("treats an invalid or non-https endpoint as not configured", () => {
    const warn = mock.method(console, "warn", () => undefined)
    for (const endpoint of ["not a url", "http://r.openai.azure.com/openai/v1/", "https://r.openai.azure.com/some/other/path"]) {
      setEnv({ FOUNDRY_ENDPOINT: endpoint, FOUNDRY_DEPLOYMENT: "d" })
      assert.equal(getFoundryConfig(), undefined, endpoint)
    }
    warn.mock.restore()
  })

  it("falls back to templates when only one of endpoint or deployment is set", () => {
    const warn = mock.method(console, "warn", () => undefined)
    setEnv({ FOUNDRY_ENDPOINT: "https://r.openai.azure.com/openai/v1/" })
    assert.equal(getFoundryConfig(), undefined)
    setEnv({ ANALYSIS_ENGINE: "foundry", FOUNDRY_DEPLOYMENT: "d" })
    assert.equal(getFoundryConfig(), undefined)
    warn.mock.restore()
  })

  it("replaces an invalid timeout with the default", () => {
    const warn = mock.method(console, "warn", () => undefined)
    for (const t of ["abc", "-5", "10", "99999999", "1.5"]) {
      setEnv({ FOUNDRY_ENDPOINT: "https://r.openai.azure.com", FOUNDRY_DEPLOYMENT: "d", FOUNDRY_TIMEOUT_MS: t })
      assert.equal(getFoundryConfig()?.timeoutMs, 60000, t)
    }
    warn.mock.restore()
  })

  it("treats an unknown ANALYSIS_ENGINE as auto", () => {
    const warn = mock.method(console, "warn", () => undefined)
    setEnv({ ANALYSIS_ENGINE: "gpt", FOUNDRY_ENDPOINT: "https://r.openai.azure.com", FOUNDRY_DEPLOYMENT: "d" })
    assert.equal(configuredEngine(), "foundry")
    warn.mock.restore()
  })

  it("ignores a whitespace-only API key and uses Entra ID", () => {
    setEnv({ FOUNDRY_ENDPOINT: "https://r.openai.azure.com", FOUNDRY_DEPLOYMENT: "d", FOUNDRY_API_KEY: "   " })
    assert.equal(getFoundryConfig()?.auth, "entra-id")
  })

  it("never logs configured values", () => {
    const warn = mock.method(console, "warn", () => undefined)
    setEnv({
      ANALYSIS_ENGINE: "foundry",
      FOUNDRY_ENDPOINT: "https://secret-host.example/x/y",
      FOUNDRY_API_KEY: "super-secret-key",
    })
    getFoundryConfig()
    setEnv({ FOUNDRY_ENDPOINT: "https://secret-host.example/x/y", FOUNDRY_DEPLOYMENT: "d", FOUNDRY_API_KEY: "super-secret-key" })
    getFoundryConfig()
    const logged = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n")
    assert.ok(!logged.includes("secret-host") && !logged.includes("super-secret-key"))
    warn.mock.restore()
  })
})

describe("normalizeEndpoint", () => {
  it("maps every supported form to <origin>/openai/v1/", () => {
    for (const raw of [
      "https://r.services.ai.azure.com/api/projects/p",
      "https://r.services.ai.azure.com/api/projects/p/",
      "https://r.services.ai.azure.com/api/projects/p/openai/v1",
      "https://r.services.ai.azure.com/openai/v1/",
      "https://r.services.ai.azure.com",
      "https://r.services.ai.azure.com/openai",
    ]) {
      assert.equal(normalizeEndpoint(raw), "https://r.services.ai.azure.com/openai/v1/", raw)
    }
    assert.equal(normalizeEndpoint("https://r.openai.azure.com/openai/v1?api-version=x"), "https://r.openai.azure.com/openai/v1/")
  })

  it("rejects legacy deployment URLs it can't use", () => {
    assert.equal(normalizeEndpoint("https://r.openai.azure.com/openai/deployments/d/chat/completions"), undefined)
  })
})

describe("describeFoundryError", () => {
  const apiError = (status: number, message: string, code?: string) =>
    OpenAI.APIError.generate(status, { error: { message, code } }, message, new Headers())

  it("classifies timeouts, network, auth, missing deployments, throttling and server errors", () => {
    assert.equal(describeFoundryError(new OpenAI.APIConnectionTimeoutError()).kind, "timeout")
    assert.equal(describeFoundryError(new OpenAI.APIConnectionError({ message: "ECONNRESET" })).kind, "network")
    assert.equal(describeFoundryError(apiError(401, "bad key")).kind, "auth")
    assert.equal(describeFoundryError(apiError(403, "forbidden")).kind, "auth")
    assert.equal(describeFoundryError(apiError(404, "DeploymentNotFound")).kind, "deployment_not_found")
    assert.equal(describeFoundryError(apiError(429, "slow down")).kind, "rate_limited")
    assert.equal(describeFoundryError(apiError(400, "filtered", "content_filter")).kind, "content_filter")
    assert.equal(describeFoundryError(apiError(400, "bad")).kind, "bad_request")
    assert.equal(describeFoundryError(apiError(503, "busy")).kind, "server_error")
    assert.equal(describeFoundryError(new FoundryAgentError("Model output was not valid JSON")).kind, "invalid_output")
    assert.equal(describeFoundryError("weird").kind, "unknown")
  })

  it("never repeats the raw error message", () => {
    const leaky = apiError(401, "Incorrect API key provided: sk-super-secret. Case: victim lost Rs 15,000")
    const { message } = describeFoundryError(leaky)
    assert.equal(message, "Microsoft Foundry rejected the credentials (HTTP 401)")
    assert.ok(!message.includes("sk-super-secret") && !message.includes("15,000"))
  })
})
