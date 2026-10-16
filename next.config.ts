import type { NextConfig } from "next"
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants"

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }]
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

/**
 * `next build` / `next start` write to their own folder. Sharing `.next` with a
 * running or cached `next dev` leaves the dev HMR client with a stale runtime
 * bundle, which reloads the page in an endless loop.
 */
export default function config(phase: string): NextConfig {
  const production = phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER
  return { ...nextConfig, distDir: production ? ".next-prod" : ".next" }
}
