/**
 * Live check of screenshot reading against your Microsoft Foundry deployment.
 *
 *   npm run test:extract                      # every image in example_run/screenshots
 *   npm run test:extract -- path/to/image.png # one image
 *
 * Only use fictional images: each one is sent to the model. Prints the
 * validated fields (what the app would show), never raw model output.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describeFoundryError, getFoundryConfig } from "@/server/foundry/client"
import { extractPaymentDetails } from "@/server/foundry/extract"

const config = getFoundryConfig()
if (!config) {
  console.error("Foundry is not configured. Set FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT in .env.")
  process.exit(1)
}

const dir = "example_run/screenshots"
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort()
      .map((f) => path.join(dir, f))

async function main() {
  let failed = 0
  for (const file of files) {
    const started = Date.now()
    try {
      const mimeType = /\.png$/i.test(file) ? "image/png" : "image/jpeg"
      const result = await extractPaymentDetails(config!, { mimeType, base64: readFileSync(file).toString("base64") })
      console.log(`\n${path.basename(file)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
      for (const [k, v] of Object.entries(result)) if (v !== undefined) console.log(`  ${k.padEnd(22)} ${v}`)
    } catch (error) {
      failed++
      console.log(`\n${path.basename(file)}  FAILED: ${describeFoundryError(error).message}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

void main()
