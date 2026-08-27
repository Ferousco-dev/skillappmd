import Link from 'next/link'
import { List, P, PageTitle, Section, Lead } from '../components/Prose'
import { SITE_NAME } from '../site'

/**
 * Privacy.
 *
 * Every claim here is checked against the implementation or the architecture
 * docs, not written from a template. The no-cookie claim in particular is only
 * made because the codebase contains no cookie write and no analytics.
 * Retention and minimisation come from PROVENANCE.md section 4, and the
 * correction route from REQ-063 and LICENSING.md section 7.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10">
      <div className="space-y-14">
        <PageTitle
          eyebrow="Privacy"
          title="What we store, and what we do not"
          lead={`${SITE_NAME} has no accounts, sets no cookies and runs no analytics. This page says what that means in practice, and how to have information about you corrected or removed.`}
        />

        <Section title="No cookies">
          <Lead>This site sets no cookies. There is no banner because there is nothing to consent to.</Lead>
          <P>
            Your theme preference is kept in your browser&rsquo;s local storage under the key{' '}
            <code className="rounded-[3px] bg-[rgba(var(--ink-rgb),0.07)] px-[5px] py-[2px] font-mono text-[13px] text-ink">
              skillappmd-theme
            </code>
            . It never leaves your device and is never sent to us. Clearing site data removes it.
          </P>
        </Section>

        <Section title="No accounts, no tracking">
          <List
            items={[
              ['No sign in', 'There is no account system. The API is read only and has no write surface, so there is nothing to register for.'],
              ['No analytics', 'No analytics script, no tag manager, no session recording, no fingerprinting, no advertising pixel.'],
              ['No third-party embeds', 'Agent logos are served from this domain. No fonts, scripts or images are loaded from anyone else, so no third party observes your visit.'],
            ]}
          />
        </Section>

        <Section title="What the server sees">
          <P>
            Requests to the API are rate limited per client identifier, which means request metadata
            is processed to enforce that limit. This is operational, used to keep the service
            available, and is not used to build a profile of you or joined to anything else.
          </P>
        </Section>

        <Section title="Information about people in the index">
          <P>
            This is the part that matters, because the index is built from public repositories and
            the people in it did not opt in.
          </P>
          <List
            items={[
              ['Repository and owner handles are retained', 'A repository is identified as owner/repo, and the owner may be a person rather than an organisation. Attribution is mandatory on every record, so this is retained and served.'],
              ['Individual author fields are minimised', 'Beyond what attribution requires, person-linked fields are not published.'],
              ['Never collected', 'Email addresses, real names beyond a public handle, follower graphs and contribution histories are not collected at all.'],
              ['A field without a stated purpose is not stored', 'Every person-linked field must record the provenance purpose that justifies it. Minimisation is enforced as a schema rule, not left to policy.'],
            ]}
          />
          <P>
            We also never publish the contents of a SKILL.md file. What is served is metadata,
            provenance and a licence position, with a link to the original repository.
          </P>
        </Section>

        <Section title="Correction and removal">
          <Lead>
            If you are named in the index and want that corrected or removed, you can ask, and we
            will act on it.
          </Lead>
          <P>
            Authors did not opt in, so a correction and removal route is a requirement of the
            system rather than a courtesy. Every request is recorded with the request itself, who
            handled it, the outcome and the time.
          </P>
          <P>
            One limit, stated plainly: removal deletes the indexed bytes, but the record that a
            removal happened is kept permanently. Otherwise the index could not show that something
            was once there and is no longer, which is itself provenance information.
          </P>
          <p className="mt-6 font-mono text-[14px]">
            <Link href="/contact" className="text-ink transition-colors hover:text-brand-strong">
              Make a correction or removal request &rarr;
            </Link>
          </p>
        </Section>

        <Section title="Changes">
          <P>
            If this page changes in a way that affects what is collected or published, the change
            will be reflected here. There is no mailing list to notify, because we do not hold your
            email address.
          </P>
        </Section>
      </div>
    </main>
  )
}
