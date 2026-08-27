'use client'

import { useEffect, useState } from 'react'

/**
 * The primary action on the landing page.
 *
 * SkillAppMD ships as one skill. The developer copies this, installs it into their
 * agent once, and from then on the agent asks SkillAppMD which skill it needs for
 * the task in front of it.
 *
 * TODO - PACKAGE NOT PUBLISHED. The package name is a placeholder until the
 * npm package exists.
 */
export const INSTALL_COMMAND = 'npx skillappmd@latest init'

export default function InstallCommand() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setCopied(true)
    } catch {
      // Clipboard is blocked without a secure context or permission. The
      // command stays selectable, so this is a degraded path, not a failure.
    }
  }

  return (
    <div className="install">
      <code>
        <span aria-hidden="true">$</span> {INSTALL_COMMAND}
      </code>
      <button type="button" onClick={copy} aria-label="Copy install command">
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M5 15V6a2 2 0 0 1 2-2h9"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="install-status">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  )
}
