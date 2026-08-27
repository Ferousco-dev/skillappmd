import type { Metadata, Viewport } from 'next'
import './globals.css'
import StructuredData from './StructuredData'
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TAGLINE, SITE_URL } from './site'

export const metadata: Metadata = {
  // Required, or Open Graph images and canonicals resolve to relative paths.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  category: 'technology',
}

export const viewport: Viewport = {
  // Matches --surface in each theme, so the browser chrome does not flash the
  // wrong colour on load.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0f' },
  ],
  colorScheme: 'light dark',
}

/**
 * Applies the stored theme before the browser paints. Without this the page
 * renders light first and then snaps to dark, which is visible on every load
 * for a dark-theme user. It must be inline and synchronous in <head>, so it
 * cannot be a React component.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('skillappmd-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <StructuredData />
      </head>
      <body>{children}</body>
    </html>
  )
}
