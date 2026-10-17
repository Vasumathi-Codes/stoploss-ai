/** Normalisation tests. All values are fictional. Run with `npm test`. */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  classifyCounterparty,
  fnv1a,
  istDate,
  istDayDiff,
  istInstant,
  maskValue,
  normalizeAccount,
  normalizeForType,
  normalizePaymentMethod,
  normalizePhone,
  normalizeReference,
  normalizeUpiId,
  parseAmountToMinor,
  parseClockTime,
  parseDateTimeInput,
  parseDayFirstDate,
} from "@/lib/evidence/normalize"

describe("amounts", () => {
  it("parses currency markers and Indian grouping into integer paise", () => {
    assert.equal(parseAmountToMinor("₹18,500.00"), 1_850_000)
    assert.equal(parseAmountToMinor("Rs. 18500"), 1_850_000)
    assert.equal(parseAmountToMinor("INR 1,00,000"), 10_000_000)
    assert.equal(parseAmountToMinor("18,500/-"), 1_850_000)
    assert.equal(parseAmountToMinor(18500), 1_850_000)
    assert.equal(parseAmountToMinor("0.5"), 50)
  })

  it("is decimal-safe where floating point is not", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in paise it is exact.
    assert.equal(parseAmountToMinor("0.10")! + parseAmountToMinor("0.20")!, parseAmountToMinor("0.30"))
    assert.equal(parseAmountToMinor(18500.55), 1_850_055)
    assert.equal(parseAmountToMinor(0.1 + 0.2), 30, "0.30000000000000004 from a model's JSON becomes exactly 30 paise")
    assert.equal(parseAmountToMinor("18500.10"), parseAmountToMinor("18,500.1"))
  })

  it("rejects zero, negatives, malformed and absurd values", () => {
    for (const bad of ["0", "-40", "18,50,0", "18.500", "abc", "", "1e5", "₹", "12,34,5678"]) {
      assert.equal(parseAmountToMinor(bad), undefined, bad)
    }
    assert.equal(parseAmountToMinor(0), undefined)
    assert.equal(parseAmountToMinor(Number.NaN), undefined)
    assert.equal(parseAmountToMinor(2_000_000_000), undefined)
  })
})

describe("transaction references", () => {
  it("only removes whitespace and upper-cases", () => {
    assert.equal(normalizeReference("5281 0477 9213"), "528104779213")
    assert.equal(normalizeReference("n274100223"), "N274100223")
  })

  it("never collapses different identifiers by stripping meaningful characters", () => {
    assert.equal(normalizeReference("5281-0477-9213"), undefined)
    assert.equal(normalizeReference("UTR/528104779213"), undefined)
    assert.notEqual(normalizeReference("528104779213"), normalizeReference("528104779231"))
  })

  it("rejects card numbers and long digit runs", () => {
    assert.equal(normalizeReference("4111111111111111"), undefined, "Luhn-valid card number")
    assert.equal(normalizeReference("4111 1111 1111 1111"), undefined)
    assert.equal(normalizeReference("1234567890123"), undefined, "13+ digit runs are only allowed at UTR length")
    assert.equal(normalizeReference("12345"), undefined, "too short")
  })
})

describe("identifiers", () => {
  it("lower-cases UPI IDs and validates the shape", () => {
    assert.equal(normalizeUpiId("QuickBuyer77@OKDemo"), "quickbuyer77@okdemo")
    assert.equal(normalizeUpiId("not an id"), undefined)
    assert.equal(normalizeUpiId("name@gmail.com"), undefined, "email addresses aren't UPI IDs")
  })

  it("normalises Indian mobile numbers and keeps only explicit international ones", () => {
    assert.equal(normalizePhone("+91 98765 43210"), "+919876543210")
    assert.equal(normalizePhone("098765-43210"), "+919876543210")
    assert.equal(normalizePhone("9876543210"), "+919876543210")
    assert.equal(normalizePhone("+44 20 7946 0000"), "+442079460000")
    assert.equal(normalizePhone("12345678"), undefined, "ambiguous number without a country code")
    assert.equal(normalizePhone("4111 1111 1111 1111"), undefined, "card number")
  })

  it("keeps masked accounts distinguishable from full numbers", () => {
    assert.equal(normalizeAccount("XXXX9921"), "masked:9921")
    assert.equal(normalizeAccount("A/c XX4821"), "masked:4821")
    assert.equal(normalizeAccount("123456789012"), "123456789012")
    assert.notEqual(normalizeAccount("XXXX9921"), normalizeAccount("9921"))
  })

  it("classifies a free-text counterparty", () => {
    assert.deepEqual(classifyCounterparty("quickbuyer77@okdemo"), {
      factType: "recipient_upi_id",
      normalized: "quickbuyer77@okdemo",
    })
    assert.equal(classifyCounterparty("+91 98765 43210")?.factType, "recipient_phone")
    assert.equal(classifyCounterparty("XXXX9921")?.factType, "recipient_account")
    assert.deepEqual(classifyCounterparty("Global Trade Invest Pvt."), {
      factType: "recipient_name",
      normalized: "global trade invest pvt",
    })
    assert.equal(classifyCounterparty("4111 1111 1111 1111"), undefined)
    assert.equal(classifyCounterparty("otp is 482913"), undefined)
  })

  it("groups payment methods into categories", () => {
    assert.equal(normalizePaymentMethod("UPI app"), "upi")
    assert.equal(normalizePaymentMethod("Bank transfer (IMPS/NEFT/RTGS)"), "bank_transfer")
    assert.equal(normalizePaymentMethod("IMPS"), "bank_transfer")
    assert.equal(normalizePaymentMethod("Debit card"), "card")
  })
})

describe("dates and time zones", () => {
  it("reads Indian day-first dates and rejects impossible ones", () => {
    assert.equal(parseDayFirstDate("15-10-2026"), "2026-10-15")
    assert.equal(parseDayFirstDate("15/10/26"), "2026-10-15")
    assert.equal(parseDayFirstDate("15-Oct-2026"), "2026-10-15")
    assert.equal(parseDayFirstDate("31-02-2026"), undefined)
    assert.equal(parseDayFirstDate("2026-10-15"), undefined, "not day-first")
  })

  it("reads 12- and 24-hour clock times", () => {
    assert.equal(parseClockTime("14:52"), "14:52")
    assert.equal(parseClockTime("2:52 pm"), "14:52")
    assert.equal(parseClockTime("12:05 a.m."), "00:05")
    assert.equal(parseClockTime("14:31:02"), "14:31")
    assert.equal(parseClockTime("25:00"), undefined)
  })

  it("interprets zone-less times as India time, never the server's zone", () => {
    assert.deepEqual(istInstant("2026-10-15", "14:52"), { iso: "2026-10-15T09:22:00.000Z", precision: "minute" })
    assert.deepEqual(istInstant("2026-10-15"), { iso: "2026-10-15T06:30:00.000Z", precision: "day" })
    // 00:30 IST on the 16th is still the 15th in UTC; the India date must win.
    const lateNight = Date.parse("2026-10-15T19:00:00.000Z")
    assert.equal(istDate(lateNight), "2026-10-16")
    assert.equal(istDayDiff(lateNight, Date.parse("2026-10-15T09:22:00.000Z")), 1)
  })

  it("rejects future and malformed corrections", () => {
    assert.equal(parseDateTimeInput("2099-01-01T10:00"), undefined)
    assert.equal(parseDateTimeInput("15/10/2026"), undefined)
    assert.equal(parseDateTimeInput("2026-10-15")?.precision, "day")
  })
})

describe("corrections, masking and keys", () => {
  it("normalises corrections per fact type and rejects secrets", () => {
    assert.equal(normalizeForType("amount", "18,500")?.amountMinor, 1_850_000)
    assert.equal(normalizeForType("transaction_reference", "5281 0477 9213")?.normalizedValue, "528104779213")
    assert.equal(normalizeForType("transaction_reference", "4111111111111111"), undefined)
    assert.equal(normalizeForType("recipient_upi_id", "pin is 4821"), undefined)
    assert.equal(normalizeForType("message_event", "anything"), undefined, "not correctable")
  })

  it("masks identifiers but not amounts", () => {
    assert.equal(maskValue("transaction_reference", "528104779213"), "••••9213")
    assert.equal(maskValue("recipient_upi_id", "quickbuyer77@okdemo"), "qu••••••@okdemo")
    assert.equal(maskValue("recipient_phone", "+919876543210"), "••••••3210")
    assert.equal(maskValue("amount", "INR:1850000"), "INR:1850000")
  })

  it("hashes deterministically", () => {
    assert.equal(fnv1a("528104779213|528104779213"), fnv1a("528104779213|528104779213"))
    assert.notEqual(fnv1a("a"), fnv1a("b"))
    assert.match(fnv1a(""), /^[0-9a-f]{8}$/)
  })
})
