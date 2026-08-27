import type { ReactNode } from 'react'
import InstallCommand from './InstallCommand'
import { OCCURRENCE_COUNT } from '../corpus'

/**
 * The screen the hero dissolves into.
 *
 * Explains the resolver: what it is, what happens after you install it, and
 * what works today. Written as a guide rather than marketing, because the
 * audience is developers deciding whether to install something.
 */

function Label({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">{children}</p>
}

const STEPS = [
  {
    n: '01',
    title: 'Install once',
    body: 'SkillAppMD ships as a single SKILL.md. Any agent that reads skills can load it: Claude Code, Cursor, Codex, Windsurf. You are installing the resolver, not the index.',
  },
  {
    n: '02',
    title: 'Work as normal',
    body: 'Describe your task the way you always do. "Build a landing page." "Review this migration." "Draft release notes from this range." Nothing about your workflow changes.',
  },
  {
    n: '03',
    title: 'The agent asks, SkillAppMD answers',
    body: 'Mid-task your agent asks SkillAppMD what capability fits. It gets back a short list with the source repository and the licence position of each, then fetches the file from its origin. The content never passes through SkillAppMD.',
  },
]

export default function Guide() {
  return (
    <section className="next-section" aria-label="How SkillAppMD works">
      <div className="mx-auto w-full max-w-4xl px-6 py-24 md:px-10">
        <Label>Guide</Label>
        <h2 className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
          How it works
        </h2>
        <p className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-subtle">
          SkillAppMD is one skill you install into your coding agent. From then on the agent decides
          which skill it needs for the task in front of it, instead of you going looking.
        </p>

        <ol className="mt-14 border-t border-[rgba(var(--ink-rgb),0.16)]">
          {STEPS.map(step => (
            <li
              key={step.n}
              className="grid gap-x-8 gap-y-3 border-b border-[rgba(var(--ink-rgb),0.09)] py-8 sm:grid-cols-[auto_minmax(0,1fr)]"
            >
              <span className="font-mono text-[12px] tabular-nums text-brand-strong">{step.n}</span>
              <div>
                <h3 className="font-mono text-[15px] text-ink">{step.title}</h3>
                <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-subtle">
                  {step.body}
                </p>
                {step.n === '01' && (
                  <div className="mt-5">
                    <InstallCommand />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* The differentiator, stated as an argument rather than a slogan. */}
        <div className="mt-16 border-l-2 border-brand-strong pl-6">
          <Label>Why not just download everything</Label>
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-ink">
            There are {OCCURRENCE_COUNT.toLocaleString('en-US')} SKILL.md occurrences in the index
            and roughly half of them are duplicates of each other. No agent can hold that in
            context, and crawling it per task would be slow and wasteful.
          </p>
          <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-subtle">
            The hard part was never storage. It is choosing the right one, and knowing whether you
            are allowed to use it.
          </p>
        </div>

        {/* Stated plainly. The resolver is roadmap phase 5 to 7 and does not
            exist yet; implying otherwise would be the one thing this product
            cannot afford. */}
        <p className="mt-14 max-w-[62ch] font-mono text-[12px] leading-relaxed text-subtle">
          Status: the index and search are live. The resolver described above is in development.
        </p>
      </div>
    </section>
  )
}
