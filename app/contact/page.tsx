import Link from 'next/link'
import { P, PageTitle, Section, Lead } from '../components/Prose'
import { SITE_NAME } from '../site'

/**
 * Contact.
 *
 * Built around the correction and removal route, which is a Phase 1
 * requirement rather than a nicety: people in the index did not opt in. The
 * form of a good request is spelled out so a request arrives actionable.
 *
 * TODO - ADDRESS NOT CONFIRMED. contact@skillappmd.dev is a placeholder until
 * the domain and mailbox exist.
 */

const EMAIL = 'contact@skillappmd.dev'

function Mail({ subject, children }: { subject: string; children: React.ReactNode }) {
  return (
    <a
      href={`mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`}
      className="font-mono text-[14px] text-ink underline decoration-[rgba(var(--ink-rgb),0.3)] underline-offset-4 transition-colors hover:decoration-brand-strong"
    >
      {children}
    </a>
  )
}

const REASONS: { title: string; note: string; subject: string; action: string }[] = [
  {
    title: 'Correction or removal',
    note: 'You are named in the index, or a repository you own appears, and you want it corrected or taken down. This route exists because the people in the index did not opt in, and requests are acted on rather than triaged away.',
    subject: 'Correction or removal request',
    action: 'Request a correction or removal',
  },
  {
    title: 'Attribution or licence problem',
    note: 'A record shows the wrong repository or owner, or the licence position is wrong. Rights are the point of this index, so a wrong one is a defect, not a detail.',
    subject: 'Attribution or licence problem',
    action: 'Report an attribution problem',
  },
  {
    title: 'Something else',
    note: 'Questions about how resolution works, the API, or using SkillAppMD with your agent.',
    subject: 'Question',
    action: 'Ask a question',
  },
]

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10">
      <div className="space-y-14">
        <PageTitle
          eyebrow="Contact"
          title="Get in touch"
          lead={`One address, for everything. ${SITE_NAME} has no support portal and no ticket queue, so mail reaches a person.`}
        />

        <Section title="Email">
          <Lead>
            <Mail subject="Hello">{EMAIL}</Mail>
          </Lead>
          <P>
            Pick the closest reason below and the subject line will be filled in for you. It is not
            required, it just gets the request to the right place faster.
          </P>

          <ul className="mt-8 border-t border-[rgba(var(--ink-rgb),0.09)]">
            {REASONS.map(reason => (
              <li key={reason.title} className="border-b border-[rgba(var(--ink-rgb),0.09)] py-6">
                <p className="text-[15px] text-ink">{reason.title}</p>
                <p className="mt-2 max-w-[64ch] text-[14px] leading-[1.6] text-subtle">
                  {reason.note}
                </p>
                <p className="mt-4">
                  <Mail subject={reason.subject}>{reason.action} &rarr;</Mail>
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What to include in a removal request">
          <P>
            A request with these four things can be acted on immediately. Without them we have to
            write back and ask, which only slows it down for you.
          </P>
          <ol className="mt-6 border-t border-[rgba(var(--ink-rgb),0.09)]">
            {[
              ['The repository', 'As owner/repo, or a link to it.'],
              ['What is wrong', 'Removal, or a correction. If a correction, what the right value is.'],
              ['Your relationship to it', 'Owner, author, or acting for the owner. We do not need documents, just a plain statement.'],
              ['A reply address', 'So we can confirm the outcome. It is used for that and nothing else.'],
            ].map(([title, note], index) => (
              <li
                key={title}
                className="flex gap-5 border-b border-[rgba(var(--ink-rgb),0.09)] py-4"
              >
                <span className="mt-[2px] font-mono text-[13px] tabular-nums text-brand-strong">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block text-[15px] text-ink">{title}</span>
                  <span className="mt-1 block max-w-[58ch] text-[14px] leading-[1.6] text-subtle">
                    {note}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <P>
            Every request is recorded with its outcome and the time it was handled.{' '}
            <Link href="/privacy" className="text-ink transition-colors hover:text-brand-strong">
              What we store is set out in the privacy page
            </Link>
            .
          </P>
        </Section>

        <Section title="What we cannot help with">
          <P>
            SkillAppMD indexes public repositories and does not host the files themselves. If a
            skill&rsquo;s content is wrong, unsafe or broken, that belongs with the repository that
            published it, not with us. We can correct what the index says about it, and we can
            remove it from the index.
          </P>
        </Section>
      </div>
    </main>
  )
}
