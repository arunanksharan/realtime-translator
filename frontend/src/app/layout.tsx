

import * as React from "react"
import { Metadata } from "next"
import { Inter } from "next/font/google"

import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/sonner"
import { Providers } from "./providers"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Realtime Translator",
  description: "Real-time bidirectional language translation powered by AI",
  keywords: ["translation", "AI", "real-time", "language", "communication"],
  authors: [{ name: "Kuzushi Labs" }],
  creator: "Kuzushi Labs",
  publisher: "Kuzushi Labs",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    title: "Realtime Translator",
    description: "Real-time bidirectional language translation powered by AI",
    siteName: "Realtime Translator",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Realtime Translator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Realtime Translator",
    description: "Real-time bidirectional language translation powered by AI",
    images: ["/og-image.jpg"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.className
        )}
      >
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
