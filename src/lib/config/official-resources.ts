import type { OfficialResource } from "@/types"

/**
 * Single source of truth for official reporting and support channels.
 *
 * IMPORTANT: none of these entries have been verified by the STOPLOSS AI team yet,
 * so every entry is marked `unverified`. Before a production launch, confirm each
 * URL, phone number and description against the official source and record a real
 * `lastVerified` date. Never invent a verification date.
 */
export const OFFICIAL_RESOURCES: OfficialResource[] = [
  {
    id: "ncrp",
    organization: "Ministry of Home Affairs, Government of India",
    name: "National Cyber Crime Reporting Portal",
    purpose: "File an online complaint about cybercrime, including financial fraud.",
    relevance: "When you are ready to lodge a formal cybercrime complaint with your case details and evidence.",
    kind: "portal",
    url: "https://cybercrime.gov.in",
    verification: { status: "unverified" },
  },
  {
    id: "helpline-1930",
    organization: "Indian Cyber Crime Coordination Centre (I4C)",
    name: "Cybercrime Helpline 1930",
    purpose: "National helpline for reporting financial cyber fraud by phone.",
    relevance: "Soon after you notice money has left your account through a suspected fraud.",
    kind: "helpline",
    phone: "1930",
    verification: { status: "unverified" },
  },
  {
    id: "bank-official",
    organization: "Your bank or payment provider",
    name: "Official bank or payment-app support",
    purpose: "Report unauthorised transactions and ask about blocking cards, UPI or net banking.",
    relevance: "Immediately, for any transaction you did not authorise.",
    kind: "provider",
    note: "Use only the number printed on your card, passbook or the provider's official app or website. Never use a number from a search ad, SMS or social media.",
    verification: { status: "unverified" },
  },
  {
    id: "rbi-cms",
    organization: "Reserve Bank of India",
    name: "RBI Complaint Management System",
    purpose: "Escalate a complaint against a regulated entity if it is not resolved by the bank.",
    relevance: "After you have complained to your bank and are unhappy with the response.",
    kind: "regulator",
    url: "https://cms.rbi.org.in",
    verification: { status: "unverified" },
  },
  {
    id: "sanchar-saathi",
    organization: "Department of Telecommunications",
    name: "Sanchar Saathi",
    purpose: "Report suspected fraud calls or messages and check mobile connections in your name.",
    relevance: "When the fraud started with a call, SMS or WhatsApp message.",
    kind: "telecom",
    url: "https://sancharsaathi.gov.in",
    verification: { status: "unverified" },
  },
]

export function getOfficialResource(id: string | undefined) {
  if (!id) return undefined
  return OFFICIAL_RESOURCES.find((r) => r.id === id)
}

export const RESOURCE_KIND_LABELS: Record<OfficialResource["kind"], string> = {
  portal: "Online portal",
  helpline: "Helpline",
  provider: "Your provider",
  regulator: "Regulator",
  telecom: "Telecom",
}
