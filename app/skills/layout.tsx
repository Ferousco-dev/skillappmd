import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Shell from '../components/Shell'

export const metadata: Metadata = {
  title: 'Skill index',
  description:
    'Every SKILL.md file SkillAppMD has indexed, with the repository it came from and what is known about its licence.',
  alternates: { canonical: '/skills' },
}

export default function SkillsLayout({ children }: { children: ReactNode }) {
  return <Shell crumb="skills">{children}</Shell>
}
