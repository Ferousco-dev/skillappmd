'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/client'
import { listSkills } from '@/lib/api/skills'
import { OCCURRENCE_COUNT, REPOSITORY_COUNT } from '../corpus'
import { SkillResult, SkillSkeleton, TextButton } from '../components/SkillResult'
import type { Skill } from '@/lib/api/types'

type Status = 'loading' | 'more' | 'ready' | 'error'

export default function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<ApiError | null>(null)

  const runId = useRef(0)

  const load = useCallback(async (after: string | null) => {
    const id = ++runId.current
    setStatus(after ? 'more' : 'loading')
    setError(null)
    try {
      const envelope = await listSkills({ cursor: after })
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
    void load(null)
  }, [load])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10">
      <h1 className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-ink">Index</h1>
      <p className="mt-5 max-w-[64ch] text-[15px] leading-[1.65] text-subtle">
        {OCCURRENCE_COUNT.toLocaleString('en-US')} SKILL.md occurrences from{' '}
        {REPOSITORY_COUNT.toLocaleString('en-US')} public repositories. Each entry records where the
        file came from and what is known about its licence. SkillAppMD does not store the file itself.
      </p>

      {status === 'loading' && items.length === 0 && (
        <ul className="mt-12 border-t border-[rgba(var(--ink-rgb),0.09)]" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <SkillSkeleton key={i} />
          ))}
        </ul>
      )}

      {status === 'error' && items.length === 0 && (
        <div role="alert" className="mt-12">
          <p className="text-[15px] text-ink">The index did not load.</p>
          <p className="mt-2 text-[14px] text-subtle">{error?.message ?? 'Unexpected failure.'}</p>
          <div className="mt-4">
            <TextButton onClick={() => void load(null)}>Try again</TextButton>
          </div>
          {error?.requestId && (
            <p className="mt-4 font-mono text-[11px] text-subtle">
              {error.code} &middot; {error.requestId}
            </p>
          )}
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="mt-12 text-[15px] text-subtle">
          Nothing indexed yet. Entries appear here once the ingestion run completes.
        </p>
      )}

      {items.length > 0 && (
        <>
          <ul className="mt-12 border-t border-[rgba(var(--ink-rgb),0.09)]">
            {items.map(skill => (
              <SkillResult key={skill.id} skill={skill} />
            ))}
            {status === 'more' && <SkillSkeleton />}
          </ul>

          <div className="mt-8">
            {/* Cursor pagination only. There is no offset and no total, so
                there is no page number to offer. */}
            {cursor ? (
              <TextButton onClick={() => void load(cursor)} disabled={status === 'more'}>
                {status === 'more' ? 'Loading' : 'Load more'}
              </TextButton>
            ) : (
              status === 'ready' && (
                <p className="font-mono text-[12px] text-subtle">
                  End of results. <span className="tabular-nums text-ink">{items.length}</span>{' '}
                  shown.
                </p>
              )
            )}
          </div>
        </>
      )}

      <p className="mt-20 border-t border-[rgba(var(--ink-rgb),0.09)] pt-6 text-[12px] leading-[1.6] text-subtle">
        Indexed from public repositories. Each skill is subject to its own repository licence. SkillAppMD
        does not host or certify any skill.{' '}
        <Link href="/docs" className="hover:text-ink">
          Read the docs
        </Link>
        {' '}&middot;{' '}
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        {' '}&middot;{' '}
        <Link href="/contact" className="hover:text-ink">
          Contact
        </Link>
      </p>
    </main>
  )
}
