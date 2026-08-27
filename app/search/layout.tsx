import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Shell from '../components/Shell'

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search the SkillAppMD index by skill name, description, or the repository it came from. Every result shows its source and licence position.',
  alternates: { canonical: '/search' },
  // The entry point is indexable; individual result pages are not. A ?q=
  // page is thin, near-duplicate and infinite in combination.
  robots: { index: true, follow: true },
}

export default function SearchLayout({ children }: { children: ReactNode }) {
  return <Shell crumb="search">{children}</Shell>
}
