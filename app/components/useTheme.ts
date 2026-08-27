'use client'

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/**
 * Reads the theme from the <html data-theme> attribute, which is the single
 * source of truth (set before first paint by the inline script in the root
 * layout, and updated by ThemeToggle).
 *
 * Components that paint with JavaScript rather than CSS need this, because a
 * WebGL colour or a serialised SVG cannot read a CSS custom property.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')

    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
