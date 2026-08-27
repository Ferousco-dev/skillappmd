import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Shell from '../components/Shell'

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What SkillAppMD stores, what it does not, and how to have information about you corrected or removed. No cookies, no accounts, no analytics.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return <Shell crumb="privacy">{children}</Shell>
}
