import Link from 'next/link'
import type { ReactNode } from 'react'
import CursorStyles from './CursorStyles'
import PointerState from './PointerState'
import ThemeToggle from './ThemeToggle'
import { Logo } from './Logo'

/** Shared chrome for every page that is not the landing. */
export default function Shell({ crumb, children }: { crumb: string; children: ReactNode }) {
  return (
    <div className="landing min-h-svh bg-surface">
      <CursorStyles />
      <PointerState />

      <header className="sticky top-0 z-40 border-b border-[rgba(var(--ink-rgb),0.08)] bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-6 md:px-10">
          <Link href="/" aria-label="SkillAppMD home" className="flex items-center gap-3 text-ink">
            <Logo size={24} />
            <span className="font-mono text-[15px]">SkillAppMD</span>
          </Link>

          <span className="font-mono text-[13px] text-subtle" aria-hidden="true">
            /
          </span>
          <span className="font-mono text-[13px] text-ink">{crumb}</span>

          <nav aria-label="Primary" className="ml-auto flex items-center gap-6">
            <Link href="/docs" className="text-sm text-subtle transition-colors hover:text-ink">
              Docs
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {children}
    </div>
  )
}
