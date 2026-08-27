import { cn } from '@/lib/utils'
import type { Rights, RightsState } from '@/lib/api/types'

/**
 * Rights marker.
 *
 * Colour is allocated by how much the reader needs to stop, not evenly across
 * three states. `known` is the boring case and stays neutral. `unknown` gets
 * the brand accent, because an honest "we could not tell" is the one thing this
 * index offers that the alternatives do not. `restricted` is the only true
 * warning and is the only saturated colour on the page.
 *
 * DEC-018 requires unknown to stay distinct from a negative answer, so the
 * label is always present and colour is never the sole signal.
 */

const STATES: Record<RightsState, { label: string; text: string; rule: string }> = {
  known: {
    label: 'Licensed',
    text: 'text-subtle',
    rule: 'bg-[rgba(var(--ink-rgb),0.28)]',
  },
  unknown: {
    label: 'Unknown',
    text: 'text-brand-strong',
    rule: 'bg-brand-strong',
  },
}

export function RightsBadge({ rights, className }: { rights: Rights; className?: string }) {
  const state = STATES[rights.state] ?? STATES.unknown

  return (
    <span
      className={cn('inline-flex items-center gap-2 font-mono text-[11px] tracking-wide', state.text, className)}
      title={rights.basis}
    >
      {/* A square, echoing the corpus marker on the landing page, rather than
          the default rounded pill. */}
      <span className={cn('h-2 w-2', state.rule)} aria-hidden="true" />
      {state.label}
    </span>
  )
}

/** The rights state as a left-hand rule on a row. Colour is redundant with the label. */
export function rightsRule(state: RightsState) {
  return (STATES[state] ?? STATES.unknown).rule
}

/** Full statement for the detail page, where there is room to explain. */
export function RightsStatement({ rights }: { rights: Rights }) {
  const state = STATES[rights.state] ?? STATES.unknown

  return (
    <div className="flex gap-4">
      <span className={cn('mt-1 w-[3px] shrink-0', state.rule)} aria-hidden="true" />
      <div className="space-y-2">
        <p className={cn('font-mono text-sm tracking-wide', state.text)}>{state.label}</p>
        <p className="text-sm text-ink">{rights.basis}</p>
        {rights.state === 'unknown' && (
          <p className="max-w-prose text-sm text-subtle">
            SkillAppMD could not determine the licence for this file. That is not the same as knowing it
            is restricted. Check the source repository before reusing it.
          </p>
        )}
      </div>
    </div>
  )
}
