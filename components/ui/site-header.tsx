'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import ThemeToggle from '@/app/components/ThemeToggle'

const LINKS = [
  { href: '/skills', label: 'Skills' },
  { href: '/search', label: 'Search' },
]

/**
 * Header for the product routes.
 *
 * The landing page keeps its own bespoke header, because it is a different kind
 * of surface. This one is the working chrome: always present, always reachable,
 * and it never dissolves.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // A route change must close the panel, or navigating from inside it leaves
  // the menu covering the page you just asked for.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Escape closes, and the body must not scroll behind an open panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(var(--ink-rgb),0.08)] bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6 md:px-10">
        <Link href="/" aria-label="SkillAppMD home" className="shrink-0 text-ink">
          <svg viewBox="0 0 44 44" className="h-7 w-7" role="img" aria-label="SkillAppMD mark">
            <g fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke">
              <rect x="1.5" y="1.5" width="18" height="18" />
              <rect x="24.5" y="1.5" width="18" height="14" />
              <rect x="1.5" y="24.5" width="14" height="18" />
              <rect x="20.5" y="20.5" width="22" height="22" />
            </g>
          </svg>
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive(link.href)
                      ? 'bg-[rgba(var(--ink-rgb),0.07)] text-ink'
                      : 'text-subtle hover:text-ink'
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          <button
            type="button"
            className="theme-toggle md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen(value => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile navigation is a real panel rather than a shrunken desktop bar,
          with targets sized for a thumb. */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-[rgba(var(--ink-rgb),0.08)] bg-surface md:hidden"
        >
          <ul className="px-4 py-2">
            {LINKS.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-4 py-3 text-base',
                    isActive(link.href) ? 'bg-[rgba(var(--ink-rgb),0.07)] text-ink' : 'text-subtle'
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
