/**
 * Live connectivity check against your Microsoft Foundry deployment.
 *
 *   npm run test:foundry
 *
 * Sends ONE fictional case to the Incident Agent and prints the validated
 * finding titles. No database is needed and no real case data is sent.
 * Never prints the endpoint key or the model's full output.
 */
import { buildFindings, type AnalysisContext } from "@/lib/playbooks"
import { PROMPT_VERSION, runFoundryAgent } from "@/server/foundry/agents"
import { describeFoundryError, getFoundryConfig } from "@/server/foundry/client"

const ctx: AnalysisContext = {
  incident: {
    id: "smoke-test",
    reference: "SL-0000-0000",
    title: "Fictional smoke test: fake courier refund link",
    category: "phishing",
    description:
      "FICTIONAL TEST CASE. I got an SMS saying my parcel was held and needed a Rs 25 fee. I opened the link and paid with UPI. Later Rs 4,999 was debited from my account.",
    amount: 4999,
    currency: "INR",
    occurredAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    reportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentMethod: "UPI",
    hasAccountAccess: "yes",
    ongoing: "unsure",
    status: "reported",
    notes: [],
    isSample: true,
  },
  evidence: [],
  actions: [],
}

async function main() {
  const config = getFoundryConfig()
  if (!config) {
    console.error("Foundry is not configured. Set FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT in .env (see .env.example).")
    process.exit(1)
  }
  console.log(`Endpoint host: ${new URL(config.endpoint).host}`)
  console.log(`Deployment:    ${config.deployment}`)
  console.log(`Auth:          ${config.auth}`)
  console.log(`Prompt:        ${PROMPT_VERSION}\n`)

  const started = Date.now()
  const result = await runFoundryAgent(config, "incident", ctx, [], [], "smoke-test")
  console.log(`✔ Live Foundry call succeeded in ${Date.now() - started} ms; output passed schema and safety validation.\n`)
  for (const f of result.findings) console.log(`  [${f.source}] ${f.title}${f.confidence ? ` (${f.confidence})` : ""}`)
  if (result.review) console.log(`\n  Needs review: ${result.review}`)
  // Keep the template path honest too.
  console.log(`\nTemplate fallback would produce ${buildFindings("incident", ctx).length} findings.`)
}

main().catch((error: unknown) => {
  // Only the safe classification is printed: raw API messages can echo request content.
  const { kind, message } = describeFoundryError(error)
  console.error(`✘ Live Foundry call failed: ${message}`)
  if (kind === "auth") console.error("  Check FOUNDRY_API_KEY, or your Entra role (Azure AI User) on the resource.")
  if (kind === "deployment_not_found")
    console.error("  Check FOUNDRY_DEPLOYMENT matches a deployment name in Foundry → Models + endpoints.")
  if (kind === "timeout") console.error("  Raise FOUNDRY_TIMEOUT_MS or check network access to the endpoint.")
  if (kind === "invalid_output")
    console.error("  The deployment must support the Responses API with structured (json_schema) output.")
  process.exit(1)
})
