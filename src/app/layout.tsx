import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import { Providers } from "@/components/layout/providers"

import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "STOPLOSS AI", template: "%s · STOPLOSS AI" },
  description: "When every minute matters, know what to do next. Guidance and coordination for victims of digital payment fraud.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#16142b" },
    { media: "(prefers-color-scheme: light)", color: "#faf9fd" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
