import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Skills | AppMD',
  description: 'Discover and install skills for AI agents.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
