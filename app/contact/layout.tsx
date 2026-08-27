import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Shell from '../components/Shell'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with SkillAppMD: correction and removal requests, attribution or licence problems, and general questions.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: ReactNode }) {
  return <Shell crumb="contact">{children}</Shell>
}
