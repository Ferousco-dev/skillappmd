import type { ReactNode } from 'react'
import Shell from '../components/Shell'

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <Shell crumb="docs">{children}</Shell>
}
