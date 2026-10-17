/**
 * Screenshot extraction tests. The model is always a fake client here — these never call Azure.
 * Run with `npm test`.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { FoundryConfig } from "@/server/foundry/client"
import { describeFoundryError } from "@/server/foundry/client"
import {
  cleanCounterparty,
  cleanTransactionRef,
  ExtractionError,
  extractPaymentDetails,
  parseExtraction,
  toOccurredAt,
} from "@/server/foundry/extract"

const config: FoundryConfig = {
  endpoint: "https://example.invalid/openai/v1/",
  deployment: "test-deployment",
  auth: "api-key",
  timeoutMs: 1000,
}

const NOW = Date.parse("2026-10-17T06:00:00.000Z")

const raw = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    isPaymentRecord: true,
    kind: "bank_sms",
    direction: "debit",
    amount: 18500,
    currency: "INR",
    date: "2026-10-15",
    time: "14:52",
    transactionRef: "528104779213",
    counterparty: "quickbuyer77@okaxis",
    paymentMethod: "UPI app",
    containsSensitiveData: false,
    note: null,
    ...overrides,
  })

function fakeClient(output: string, status = "completed") {
  const calls: Record<string, unknown>[] = []
  const client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        calls.push(body)
        return { id: "resp_test", status, output_text: output }
      },
    },
  }
  return { client: client as unknown as Parameters<typeof extractPaymentDetails>[2], calls }
}

describe("parseExtraction", () => {
  it("maps a clean bank SMS reading", () => {
    const r = parseExtraction(raw(), NOW)
    assert.equal(r.amount, 18500)
    assert.equal(r.currency, "INR")
    assert.equal(r.occurredAt, "2026-10-15T09:22:00.000Z", "India time is converted to UTC")
    assert.equal(r.transactionRef, "528104779213")
    assert.equal(r.counterparty, "quickbuyer77@okaxis")
    assert.equal(r.paymentMethod, "UPI app")
    assert.equal(r.note, undefined)
  })

  it("rejects non-JSON and off-schema output", () => {
    assert.throws(() => parseExtraction("I can see an SMS", NOW), ExtractionError)
    assert.throws(() => parseExtraction(JSON.stringify({ amount: 5 }), NOW), ExtractionError)
    assert.equal(describeFoundryError(new ExtractionError("x")).kind, "invalid_output")
  })

  it("drops values that fail screening instead of showing them", () => {
    const r = parseExtraction(
      raw({
        amount: -40,
        currency: "BTC",
        transactionRef: "4111 1111 1111 1111",
        counterparty: "XX4821",
        paymentMethod: "Telepathy",
        note: "OTP is 482913",
      }),
      NOW,
    )
    assert.equal(r.amount, undefined)
    assert.equal(r.currency, undefined)
    assert.equal(r.transactionRef, undefined, "card numbers are never a reference")
    assert.equal(r.counterparty, undefined, "the person's own masked account is ignored")
    assert.equal(r.paymentMethod, undefined)
    assert.equal(r.note, undefined, "notes containing secrets are dropped")
  })

  it("defaults the currency to INR only when there is an amount", () => {
    assert.equal(parseExtraction(raw({ currency: null }), NOW).currency, "INR")
    assert.equal(parseExtraction(raw({ amount: null, currency: null }), NOW).currency, undefined)
  })
})

describe("field helpers", () => {
  it("toOccurredAt rejects bad, impossible and future dates", () => {
    assert.equal(toOccurredAt("15-10-2026", "10:00", NOW), undefined)
    assert.equal(toOccurredAt("2026-02-31", "10:00", NOW), undefined)
    assert.equal(toOccurredAt("2026-12-01", "10:00", NOW), undefined)
    assert.equal(toOccurredAt("2026-10-15", "25:99", NOW), "2026-10-15T06:30:00.000Z", "bad times fall back to noon")
  })

  it("cleanTransactionRef keeps UTR-like ids only", () => {
    assert.equal(cleanTransactionRef("5281 0477 9213"), "528104779213")
    assert.equal(cleanTransactionRef("N274100223"), "N274100223")
    assert.equal(cleanTransactionRef("4111111111111111"), undefined)
    assert.equal(cleanTransactionRef("abc"), undefined)
    assert.equal(cleanTransactionRef("UTR: 1234-5678"), undefined)
  })

  it("cleanCounterparty keeps UPI ids and phone numbers", () => {
    assert.equal(cleanCounterparty(" quickbuyer77@okaxis "), "quickbuyer77@okaxis")
    assert.equal(cleanCounterparty("+91 98765 43210"), "+91 98765 43210")
    assert.equal(cleanCounterparty("a/c XX4821"), undefined)
    assert.equal(cleanCounterparty("PIN: 1234"), undefined)
  })
})

describe("extractPaymentDetails", () => {
  it("sends the image once, unstored, with strict structured output", async () => {
    const { client, calls } = fakeClient(raw())
    const result = await extractPaymentDetails(config, { mimeType: "image/png", base64: "aGVsbG8=" }, client)
    assert.equal(result.transactionRef, "528104779213")
    assert.equal(calls.length, 1)
    const body = calls[0] as {
      model: string
      store: boolean
      input: { content: { type: string; image_url?: string }[] }[]
      text: { format: { strict: boolean } }
    }
    assert.equal(body.model, "test-deployment")
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    const image = body.input[0].content.find((c) => c.type === "input_image")
    assert.equal(image?.image_url, "data:image/png;base64,aGVsbG8=")
  })

  it("fails on incomplete or empty responses", async () => {
    await assert.rejects(
      extractPaymentDetails(config, { mimeType: "image/png", base64: "x" }, fakeClient(raw(), "incomplete").client),
      ExtractionError,
    )
    await assert.rejects(
      extractPaymentDetails(config, { mimeType: "image/png", base64: "x" }, fakeClient("  ").client),
      ExtractionError,
    )
  })
})
