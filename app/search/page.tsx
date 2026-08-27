'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { search } from '@/lib/api/search'
import type { Skill } from '@/lib/api/types'
import { SkillResult, SkillSkeleton, TextButton } from '../components/SkillResult'

type Status = 'idle' | 'loading' | 'more' | 'ready' | 'error'

function Results() {
  const router = useRouter()
  const params = useSearchParams()
  const q = params.get('q') ?? ''

  const [draft, setDraft] = useState(q)
  const [items, setItems] = useState<Skill[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(q ? 'loading' : 'idle')
  const [error, setError] = useState<ApiError | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const runId = useRef(0)

  useEffect(() => setDraft(q), [q])

  const run = useCallback(async (term: string, after: string | null) => {
    if (!term) {
      setItems([])
      setCursor(null)
      setStatus('idle')
      return
    }
    const id = ++runId.current
    setStatus(after ? 'more' : 'loading')
    setError(null)
    try {
      const envelope = await search({ q: term, cursor: after })
      // A slower earlier query must not overwrite a newer one.
      if (id !== runId.current) return
      setItems(prev => (after ? [...prev, ...envelope.data] : envelope.data))
      setCursor(envelope.cursor?.next ?? null)
      setStatus('ready')
    } catch (cause) {
      if (id !== runId.current) return
      setError(cause instanceof ApiError ? cause : null)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void run(q, null)
  }, [q, run])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const term = draft.trim()
    // The URL is the source of truth, so results are shareable and survive a
    // reload or a back navigation.
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search')
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10">
      <h1 className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-ink">Search</h1>

      <form onSubmit={submit} role="search" className="mt-8">
        <div className="flex items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.22)] pb-3 transition-colors focus-within:border-brand-strong">
          <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0 text-subtle" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            type="search"
            name="q"
            autoComplete="off"
            autoFocus
            aria-label="Search skills"
            placeholder="Name, description, or repository"
            className="w-full bg-transparent font-mono text-[17px] text-ink outline-none placeholder:text-subtle"
          />
        </div>
      </form>

      {status === 'idle' && (
        <p className="mt-10 text-[15px] leading-[1.6] text-subtle">
          Search the index by skill name, by what it does, or by the repository it came from. Every
          result shows where it came from and what is known about its licence.
        </p>
      )}

      {status === 'loading' && (
        <ul className="mt-10 border-t border-[rgba(var(--ink-rgb),0.09)]" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <SkillSkeleton key={i} />
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div role="alert" className="mt-10">
          <p className="text-[15px] text-ink">That search did not complete.</p>
          <p className="mt-2 text-[14px] text-subtle">{error?.message ?? 'Unexpected failure.'}</p>
          {error?.isRetryable !== false && (
            <div className="mt-4">
              <TextButton onClick={() => void run(q, null)}>Try again</TextButton>
            </div>
          )}
          {error?.requestId && (
            <p className="mt-4 font-mono text-[11px] text-subtle">
              {error.code} &middot; {error.requestId}
            </p>
          )}
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <div className="mt-10">
          <p className="text-[15px] text-ink">
            Nothing matched <span className="font-mono text-brand-strong">{q}</span>.
          </p>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.6] text-subtle">
            Try a broader word, or search by the repository owner instead.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <p className="mt-10 font-mono text-[12px] text-subtle">
            {/* No total exists: cursor pagination carries no count, so this
                describes what is on screen rather than claiming a result count. */}
            <span className="tabular-nums text-ink">{items.length}</span> shown
          </p>

          <ul className="mt-4 border-t border-[rgba(var(--ink-rgb),0.09)]">
            {items.map(skill => (
              <SkillResult key={skill.id} skill={skill} />
            ))}
            {status === 'more' && <SkillSkeleton />}
          </ul>

          {cursor && (
            <div className="mt-8">
              <TextButton onClick={() => void run(q, cursor)} disabled={status === 'more'}>
                {status === 'more' ? 'Loading' : 'Load more'}
              </TextButton>
            </div>
          )}
        </>
      )}

      <p className="mt-20 border-t border-[rgba(var(--ink-rgb),0.09)] pt-6 text-[12px] leading-[1.6] text-subtle">
        Indexed from public repositories. Each skill is subject to its own repository licence. SkillAppMD
        does not host or certify any skill. <Link href="/docs" className="hover:text-ink">Read the docs</Link>{' '}&middot;{' '}<Link href="/privacy" className="hover:text-ink">Privacy</Link>{' '}&middot;{' '}<Link href="/contact" className="hover:text-ink">Contact</Link>
      </p>
    </main>
  )
}

export default function SearchPage() {
  // useSearchParams needs a Suspense boundary or the route opts out of static
  // rendering at build time.
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10" />}>
      <Results />
    </Suspense>
  )
}
