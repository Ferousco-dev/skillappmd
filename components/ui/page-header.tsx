import type { ReactNode } from 'react'

/**
 * Page heading for the product routes.
 *
 * The eyebrow plus accent square is lifted from the corpus counter on the
 * landing page, deliberately, so the two halves of the product read as one
 * thing rather than two projects.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string
  title: string
  description?: string
  aside?: ReactNode
}) {
  return (
    <header className="border-b border-[rgba(var(--ink-rgb),0.16)] pb-8">
      {eyebrow && (
        <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
          <span className="h-2 w-2 bg-brand" aria-hidden="true" />
          {eyebrow}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h1 className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {aside}
      </div>

      {description && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-subtle">{description}</p>
      )}
    </header>
  )
}
