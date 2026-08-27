import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Empty and error states are product, not polish (FRONTEND-DESIGN.md §5).
 * Each says what happened and offers the next action.
 */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-[rgba(var(--ink-rgb),0.16)] px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-subtle">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  code,
  requestId,
  retryAfter,
  onRetry,
}: {
  title?: string
  message: string
  code?: string
  requestId?: string | null
  retryAfter?: number | null
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-600/30 bg-rose-500/[0.06] px-6 py-10 text-center"
    >
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-subtle">{message}</p>

      {typeof retryAfter === 'number' && (
        <p className="mt-2 text-sm text-subtle">Try again in {retryAfter} seconds.</p>
      )}

      {/* Codes are the contract and request_id is what support needs (API.md §7). */}
      {(code || requestId) && (
        <p className="mt-4 font-mono text-[11px] text-subtle">
          {code}
          {code && requestId ? ' · ' : ''}
          {requestId}
        </p>
      )}

      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
