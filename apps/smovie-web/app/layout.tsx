import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SMovie — Lecture",
  description: "Lecteur SMovie",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-black text-white">{children}</body>
    </html>
  )
}
