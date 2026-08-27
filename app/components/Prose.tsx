import type { ReactNode } from 'react'

/** Shared long-form typography, matching the documentation page. */

export function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header>
      <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
        <span className="h-2 w-2 bg-brand" aria-hidden="true" />
        {eyebrow}
      </p>
      <h1 className="mt-5 text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
        {title}
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px] leading-[1.55] text-subtle">{lead}</p>
    </header>
  )
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-[rgba(var(--ink-rgb),0.12)] pt-10">
      <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.65] text-subtle first:mt-0">{children}</p>
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[68ch] text-[16px] leading-[1.6] text-ink first:mt-0">{children}</p>
}

export function List({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-6 border-t border-[rgba(var(--ink-rgb),0.09)]">
      {items.map(([title, note]) => (
        <li key={title} className="border-b border-[rgba(var(--ink-rgb),0.09)] py-4">
          <p className="text-[15px] text-ink">{title}</p>
          <p className="mt-1.5 max-w-[64ch] text-[14px] leading-[1.6] text-subtle">{note}</p>
        </li>
      ))}
    </ul>
  )
}
