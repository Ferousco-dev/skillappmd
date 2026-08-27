import Link from 'next/link'
import { RightsBadge, rightsRule } from '@/components/ui/rights-badge'
import { cn } from '@/lib/utils'
import type { Attribution, Skill } from '@/lib/api/types'

/**
 * One line in the index.
 *
 * A ledger row, not a card. Boxing three million records in bordered rectangles
 * wastes vertical space and reads as a storefront; an index of this size wants
 * rules and alignment so the eye can run down a column. The hairline geometry is
 * carried over from the stepped figure on the landing page.
 */
export function SkillRow({
  skill,
  attribution,
  occurrences,
}: {
  skill: Skill
  attribution: Attribution
  occurrences?: number
}) {
  return (
    <article className="group relative border-b border-[rgba(var(--ink-rgb),0.09)] transition-colors hover:bg-[rgba(var(--ink-rgb),0.03)]">
      {/* The rights state as a rule that only appears on hover, so a scan down
          the list stays quiet until the reader engages with a row. */}
      <span
        className={cn(
          'absolute left-0 top-0 h-full w-[2px] opacity-0 transition-opacity group-hover:opacity-100',
          rightsRule(skill.rights.state)
        )}
        aria-hidden="true"
      />

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
        <div className="min-w-0">
          <h3 className="font-mono text-[15px] text-ink">
            <Link href={`/skills/${skill.id}`} className="hover:text-brand">
              <span className="absolute inset-0" aria-hidden="true" />
              {skill.declared.name}
            </Link>
          </h3>
          <p className="mt-1 truncate text-[13px] text-subtle">{skill.declared.description}</p>
        </div>

        <dl className="flex shrink-0 items-baseline gap-6 sm:justify-end">
          <div className="min-w-0">
            <dt className="sr-only">Repository</dt>
            {/* Raised above the row's full-area link overlay, otherwise the
                overlay swallows the click and every repository leads to the
                skill instead of the source. */}
            <dd className="truncate font-mono text-[12px] text-subtle">
              <Link
                href={`/sources/${encodeURIComponent(attribution.repository)}`}
                className="relative z-10 hover:text-ink"
              >
                {attribution.repository}
              </Link>
            </dd>
          </div>

          {typeof occurrences === 'number' && occurrences > 0 && (
            <div className="text-right">
              <dt className="sr-only">Occurrences</dt>
              {/* Tabular figures so counts align down the column. */}
              <dd className="font-mono text-[12px] tabular-nums text-subtle">
                {occurrences.toLocaleString('en-US')}
              </dd>
            </div>
          )}

          <div className="w-[92px] shrink-0 text-right sm:text-left">
            <dt className="sr-only">Rights</dt>
            <dd>
              <RightsBadge rights={skill.rights} />
            </dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

/** Column labels. Rendered once above the list, like a ledger heading. */
export function SkillRowHeader() {
  return (
    <div className="hidden border-b border-[rgba(var(--ink-rgb),0.16)] px-4 pb-2 text-[10px] uppercase tracking-[0.14em] text-subtle sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
      <span>Skill</span>
      <span className="flex gap-6 sm:justify-end">
        <span>Repository</span>
        <span>Seen</span>
        <span className="w-[92px] text-left">Rights</span>
      </span>
    </div>
  )
}
