'use client'

import { useEffect, useRef } from 'react'

/**
 * Compact search in the header.
 *
 * Moved out of the hero so the hero can carry the install command instead. A
 * plain GET form, so it works before hydration and the result URL is
 * shareable.
 */
export default function HeaderSearch() {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return
      const active = document.activeElement
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      if (typing) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form action="/search" method="get" role="search" className="header-search">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        name="q"
        autoComplete="off"
        aria-label="Search skills"
        placeholder="Describe what you need"
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  )
}
