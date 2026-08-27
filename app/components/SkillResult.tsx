'use client'

import { useEffect, useState } from 'react'
import { buildSkillPrompt } from './skillPrompt'
import type { Rights, Skill } from '@/lib/api/types'

/**
 * Rights marker.
 *
 * Colour is spent where the reader has to stop, not shared evenly. Licensed is
 * the boring case and stays neutral. Unknown carries the accent, because an
 * honest "we could not tell" is the point of this index. Restricted is the only
 * warning. There is no third state: a licence that forbids redistribution is still
 * `known`, and `redistributable` carries that. DEC-018 requires unknown to stay distinct
 * from a refusal, so the word is always present and colour is never the only signal.
 */
export function RightsMark({ rights }: { rights: Rights }) {
  const map = {
    known: ['Licensed', 'bg-[rgba(var(--ink-rgb),0.4)]', 'text-subtle'],
    unknown: ['Unknown', 'bg-brand-strong', 'text-brand-strong'],
  } as const
  const [label, swatch, tone] = map[rights.state] ?? map.unknown

  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[12px] ${tone}`}
      title={rights.basis}
    >
      <span className={`h-2 w-2 shrink-0 ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  )
}

/**
 * One skill in a list.
 *
 * The primary action is copying a prompt, not opening a page. SkillAppMD cannot
 * serve the file, so the useful thing to hand a developer is the instruction
 * their agent can act on.
 */
export function SkillResult({ skill }: { skill: Skill }) {
  // The record's OWN attribution, never a synthesised one. The API refuses to serve a
  // record without it (REQ-061, NFR-004), so it is always present and always correct;
  // deriving it locally produced `unknown/unknown` against live data and pointed the
  // source link at a repository that does not exist.
  const attribution = skill.attribution
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildSkillPrompt(skill, attribution))
      setCopied(true)
    } catch {
      // Clipboard blocked without a secure context. Degraded, not broken.
    }
  }

  return (
    <li className="border-b border-[rgba(var(--ink-rgb),0.09)] py-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 className="font-mono text-[16px] text-ink">{skill.declared.name}</h2>
        <RightsMark rights={skill.rights} />
      </div>

      <p className="mt-2 max-w-[70ch] text-[14px] leading-[1.6] text-subtle">
        {skill.declared.description}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-subtle">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 border border-[rgba(var(--ink-rgb),0.2)] px-3 py-1.5 text-ink transition-colors hover:border-brand-strong"
        >
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          {copied ? 'Copied' : 'Copy prompt'}
        </button>

        <span>{attribution.repository}</span>
        {/* No occurrence count here. The search payload does not carry one, and the
            previous fixture-derived "seen N×" invented a figure about somebody else's
            repository - which is also the popularity ranking this project states it does
            not do. A real count is available from /skills/:id/occurrences. */}
        <a
          href={attribution.canonical_source_url}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-colors hover:text-ink"
        >
          source &rarr;
        </a>
      </div>
    </li>
  )
}

export function SkillSkeleton() {
  return (
    <li className="border-b border-[rgba(var(--ink-rgb),0.09)] py-6" aria-hidden="true">
      <div className="h-4 w-48 animate-pulse bg-[rgba(var(--ink-rgb),0.07)]" />
      <div className="mt-3 h-3.5 w-full max-w-lg animate-pulse bg-[rgba(var(--ink-rgb),0.07)]" />
      <div className="mt-4 h-7 w-32 animate-pulse bg-[rgba(var(--ink-rgb),0.07)]" />
    </li>
  )
}

/** Underlined text button, the only button style in the product surfaces. */
export function TextButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-b border-[rgba(var(--ink-rgb),0.3)] pb-0.5 font-mono text-[13px] text-ink transition-colors hover:border-brand-strong disabled:opacity-50"
    >
      {children}
    </button>
  )
}
