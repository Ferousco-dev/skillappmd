import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import InstallCommand from '../components/InstallCommand'
import { OCCURRENCE_COUNT, REPOSITORY_COUNT } from '../corpus'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'How SkillAppMD works: install the resolver into your coding agent, how skills are resolved, what the three rights states mean, and the read-only API.',
  alternates: { canonical: '/docs' },
}

/**
 * Documentation.
 *
 * Content is transcribed from the project's own docs and from real API output so
 * it cannot drift into marketing: endpoints and the envelope from a live response,
 * the rights model from packages/skill-core rights.js and DEC-018, the licence
 * layers from API.md section 3, caching from REQ-099 and NFR-040. Anything not yet
 * built is labelled.
 *
 * Rewritten 2026-08-27 after checking every claim against the running code. Three
 * statements did not survive: a `restricted` rights state that does not exist, an
 * envelope with `attribution` at the top level, and a five-endpoint API that has six.
 */

const SECTIONS = [
  { id: 'what', label: 'What SkillAppMD is' },
  { id: 'install', label: 'Install' },
  { id: 'resolver', label: 'How resolution works' },
  { id: 'identity', label: 'Identity and duplicates' },
  { id: 'licence', label: 'How licence is decided' },
  { id: 'rights', label: 'Rights states' },
  { id: 'api', label: 'API' },
  { id: 'caching', label: 'Caching' },
  { id: 'limits', label: 'Boundaries' },
  { id: 'status', label: 'Status' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-[rgba(var(--ink-rgb),0.12)] pt-10">
      <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[15px] leading-[1.65] text-subtle first:mt-0">{children}</p>
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[17px] leading-[1.6] text-ink first:mt-0">{children}</p>
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-10 text-[15px] font-semibold text-ink">{children}</h3>
}

function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] bg-[rgba(var(--ink-rgb),0.07)] px-[5px] py-[2px] font-mono text-[13px] text-ink">
      {children}
    </code>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto border border-[rgba(var(--ink-rgb),0.12)] bg-raised p-5 font-mono text-[12.5px] leading-[1.7] text-ink">
      <code>{children}</code>
    </pre>
  )
}

const ENDPOINTS: [string, string][] = [
  ['/api/v1/health', 'Liveness and the live schema version.'],
  ['/api/v1/skills', 'List indexed skills. Cursor paginated.'],
  ['/api/v1/skills/:id', 'One skill: declared fields, licence, rights, attribution.'],
  ['/api/v1/skills/:id/occurrences', 'Where else the same file was found.'],
  ['/api/v1/sources/:id', 'One source and its declared access policy.'],
  ['/api/v1/search?q=', 'Keyword search over canonical metadata. Cursor paginated.'],
]

const RIGHTS: [string, string, string, string][] = [
  [
    'known',
    'Licensed',
    'A licence was resolved. `basis` names which layer decided it, and `redistributable` says what that licence permits.',
    'bg-[rgba(var(--ink-rgb),0.4)]',
  ],
  [
    'unknown',
    'Unknown',
    'No licence could be determined. Not a refusal, and not the same as forbidden.',
    'bg-brand-strong',
  ],
]

const LAYERS: [string, string, string][] = [
  ['l1_dataset', 'Dataset', 'The licence of the corpus the record was discovered through.'],
  ['l2_repository', 'Repository', 'The LICENSE file of the repository the file lives in. This is the layer that usually decides.'],
  ['l3_declared', 'Declared', 'A licence claimed in the SKILL.md frontmatter. A claim, not proof: a file cannot license itself out of its repository.'],
]

const STEPS: [string, string][] = [
  ['Your agent hits a gap', 'It reaches a task needing a capability it does not have.'],
  ['It asks SkillAppMD', 'Describing the task, not naming a package.'],
  ['SkillAppMD answers with candidates', 'A short list, each with its source repository and rights state.'],
  ['Your agent fetches from origin', 'Straight from the source repository. Content never passes through SkillAppMD.'],
]

const LIMITS: [string, string][] = [
  ['Serve skill content', 'The body of a SKILL.md is never returned, whatever its licence.'],
  ['Rank by popularity', 'SkillAppMD does not distribute skills, so it cannot count installs.'],
  ['Publish a trust score', 'A score without its evidence is not representable. Absence of findings is never reported as safe.'],
  ['Certify anything', 'Indexing is not endorsement. Each skill remains under its own repository licence.'],
]

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16 md:px-10">
      <div className="gap-14 lg:grid lg:grid-cols-[190px_minmax(0,1fr)]">
        {/* Contents on the left, which is where a reader looks for it and
            which stops the text column drifting against a dead right margin. */}
        <nav aria-label="On this page" className="mb-12 lg:mb-0">
          <div className="lg:sticky lg:top-28">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Contents</p>
            <ul className="mt-4 space-y-1 border-l border-[rgba(var(--ink-rgb),0.12)]">
              {SECTIONS.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[13px] text-subtle transition-colors hover:border-brand-strong hover:text-ink"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="min-w-0 max-w-[68ch] space-y-14">
          <header>
            <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
              <span className="h-2 w-2 bg-brand" aria-hidden="true" />
              Documentation
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
              A resolver for agent skills
            </h1>
            <p className="mt-5 text-[18px] leading-[1.55] text-subtle">
              Install SkillAppMD once into your coding agent. From then on it works out which SKILL.md
              you need for the task in front of you, instead of you going looking.
            </p>
          </header>

          <Section id="what" title="What SkillAppMD is">
            <Lead>
              An index of {OCCURRENCE_COUNT.toLocaleString('en-US')} SKILL.md occurrences from{' '}
              {REPOSITORY_COUNT.toLocaleString('en-US')} public repositories, recording for each one
              where it came from and whether you are allowed to use it.
            </Lead>
            <P>
              It is not a package registry and not a file host. The question it answers is not
              &ldquo;what does this skill say&rdquo; but &ldquo;where did it come from, and may I
              use it&rdquo;.
            </P>
            <P>
              That framing decides everything below. Because SkillAppMD never holds the answer to the
              first question, it can be honest about the second.
            </P>
          </Section>

          <Section id="install" title="Install">
            <P>
              SkillAppMD ships as a single SKILL.md. Any agent that loads skills can load it: Claude
              Code, Cursor, Codex, Windsurf and others.
            </P>
            <div className="mt-6">
              <InstallCommand />
            </div>
            <P>
              You are installing the resolver, not the index. Nothing lands on your machine beyond
              that one file.
            </P>
          </Section>

          <Section id="resolver" title="How resolution works">
            <ol className="mt-2">
              {STEPS.map(([title, note], index) => (
                <li
                  key={title}
                  className="flex gap-5 border-b border-[rgba(var(--ink-rgb),0.09)] py-5 last:border-0"
                >
                  <span className="mt-[2px] font-mono text-[13px] tabular-nums text-brand-strong">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="block text-[15px] text-ink">{title}</span>
                    <span className="mt-1 block text-[14px] leading-[1.6] text-subtle">{note}</span>
                  </span>
                </li>
              ))}
            </ol>
            <P>
              Step four is the one that matters. SkillAppMD never serves third-party skill content, so
              the fetch happens between your agent and the origin. What SkillAppMD contributes is the
              pointer and the licence position.
            </P>
          </Section>

          <Section id="identity" title="Identity and duplicates">
            <P>
              The same SKILL.md is copied between repositories constantly. Roughly half of all
              occurrences measured were duplicates of something already seen, so an index that
              treated every copy as a separate skill would overstate the ecosystem by about two
              times.
            </P>
            <P>
              Each record therefore carries two hashes, and the difference between them is the
              whole deduplication story.
            </P>
            <Pre>{`"identity": {
  "content_hash":    "sha256:c2e4a73a…",   // the raw bytes, exactly as found
  "normalised_hash": "sha256:bd17276e…"    // after line endings, trailing
}                                          // whitespace and key order settle`}</Pre>
            <P>
              Two files with the same <C>content_hash</C> are byte-identical. Two files with the
              same <C>normalised_hash</C> but different <C>content_hash</C> are the same skill saved
              by a different editor. Both collapse to one canonical record; every copy survives as
              an <em>occurrence</em>, which is what{' '}
              <C>/api/v1/skills/:id/occurrences</C> returns.
            </P>
            <P>
              Nothing is discarded in the collapse. If you need to know that a skill appears in
              forty repositories, that is a query rather than a guess.
            </P>
          </Section>

          <Section id="licence" title="How licence is decided">
            <P>
              Licence is not one field, because in reality it is not one fact. Three layers are
              recorded separately and never merged into a single verdict you cannot audit.
            </P>
            <dl className="mt-6 space-y-0">
              {LAYERS.map(([key, label, note]) => (
                <div
                  key={key}
                  className="flex flex-col gap-1 border-b border-[rgba(var(--ink-rgb),0.09)] py-4 first:border-t sm:flex-row sm:gap-5"
                >
                  <dt className="flex shrink-0 items-baseline gap-3 sm:w-[190px]">
                    <span className="text-[15px] text-ink">{label}</span>
                  </dt>
                  <dd className="min-w-0 text-[14px] leading-[1.6] text-subtle">
                    <C>{key}</C>
                    <span className="mt-1.5 block">{note}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <P>
              Where the layers disagree, <C>conflict</C> is set and the disagreement stays visible.
              A record whose frontmatter claims MIT inside a repository with no LICENSE file is not
              quietly promoted to MIT — the claim is recorded as a claim.
            </P>
            <P>
              This matters more than it sounds: <strong>47.8% of repositories carry no licence at
              all</strong>, measured across 3,074 real repositories. A model that forced a single
              answer would be inventing one for nearly half the index.
            </P>
          </Section>

          <Section id="rights" title="Rights states">
            <P>
              There are exactly two states. Whether you may redistribute is a separate field,
              because it is a separate question.
            </P>
            <dl className="mt-6 space-y-0">
              {RIGHTS.map(([value, label, note, swatch]) => (
                <div
                  key={value}
                  className="flex gap-4 border-b border-[rgba(var(--ink-rgb),0.09)] py-4 first:border-t"
                >
                  <span className={`mt-[7px] h-2.5 w-2.5 shrink-0 ${swatch}`} aria-hidden="true" />
                  <div>
                    <dt className="flex items-baseline gap-3">
                      <span className="text-[15px] text-ink">{label}</span>
                      <C>{value}</C>
                    </dt>
                    <dd className="mt-1.5 text-[14px] leading-[1.6] text-subtle">{note}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <P>
              You will notice there is no <C>restricted</C> state. A licence that forbids
              redistribution is still a <em>known</em> licence — it reports{' '}
              <C>state: &quot;known&quot;</C> with <C>redistributable: false</C>. Folding those into
              one label would destroy the distinction between &ldquo;we know you may not&rdquo; and
              &ldquo;we do not know&rdquo;.
            </P>
            <P>
              That distinction is the point. <C>unknown</C> never means forbidden; it means SkillAppMD
              could not determine the licence and you should check the source before reusing the
              file. Measured over 4,665 records from 3,074 repositories,{' '}
              <strong>60.1% resolve to <C>unknown</C></strong> — so this is the ordinary case, not
              a rare edge, and collapsing it into a false boolean would misrepresent most of the
              index.
            </P>
          </Section>

          <Section id="api" title="API">
            <P>
              Six read-only endpoints. There is no write surface: ingestion runs as a batch job,
              not over HTTP.
            </P>

            <div className="mt-6 overflow-hidden border border-[rgba(var(--ink-rgb),0.12)]">
              {ENDPOINTS.map(([path, note], index) => (
                <div
                  key={path}
                  className={`flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-5 ${
                    index > 0 ? 'border-t border-[rgba(var(--ink-rgb),0.09)]' : ''
                  }`}
                >
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-brand-strong">
                    GET
                  </span>
                  <code className="min-w-0 break-words font-mono text-[13px] text-ink">{path}</code>
                  <span className="text-[13px] text-subtle sm:ml-auto sm:text-right">{note}</span>
                </div>
              ))}
            </div>

            <H3>Response envelope</H3>
            <P>
              Every successful response has the same four keys at the top level. Attribution lives
              inside the record, not beside it, because it belongs to the record: a skill cannot be
              served without it.
            </P>
            <Pre>{`{
  "data":   { … },                       // the record, or an array of records
  "meta":   { "request_id": "…", "generated_at": "…" },
  "cursor": { "next": "opaque-or-null", "limit": 50 },   // collections only
  "notice": "…"
}`}</Pre>
            <P>And inside a skill record, the parts a consumer usually wants:</P>
            <Pre>{`{
  "declared":    { "name", "description", "frontmatter", "allowed_tools" },
  "inferred":    { },
  "identity":    { "content_hash", "normalised_hash" },
  "licence":     { "l1_dataset", "l2_repository", "l3_declared", "conflict" },
  "rights":      { "state", "indexable", "linkable",
                   "redistributable", "cacheable", "basis", "computed_at" },
  "temporal":    { "first_commit_at", "last_commit_at",
                   "discovered_at", "last_verified_at" },
  "provenance":  { "sources", "field_origins" },
  "attribution": { "repository", "owner", "canonical_source_url" },
  "content":            null,
  "content_available":  false
}`}</Pre>

            <H3>Facts and inferences stay separate</H3>
            <P>
              <C>declared</C> holds what the source file states. <C>inferred</C> holds what SkillAppMD
              worked out. They are separate objects so a consumer cannot read one as the other by
              accident. Today <C>inferred</C> is empty, by design.
            </P>
            <P>
              The finer-grained version is <C>provenance.field_origins</C>, which labels each field
              with its origin — either <C>source_fact:</C> and where it came from, or{' '}
              <C>appmd_inference:</C> and the analyser and version that produced it.
            </P>
            <Pre>{`"field_origins": {
  "declared.name":          "source_fact:gitskills#frontmatter.name",
  "licence.l2_repository":  "source_fact:gitskills#repos.license",
  "identity.content_hash":  "appmd_inference:fingerprint@0.1.0",
  "rights.redistributable": "appmd_inference:rights-engine@0.1.0"
}`}</Pre>
            <P>
              Every SkillAppMD judgement therefore arrives with the version that made it. When an
              analyser changes, the records it touched are a query rather than a guess.
            </P>

            <H3>Pagination</H3>
            <P>
              Cursors are opaque and there is no offset parameter, because offset pagination is
              incorrect under concurrent writes. There is no total either, so a client cannot show a
              page count. When <C>cursor.next</C> is null, you have reached the end. Page size is
              capped at 100 and defaults to 50.
            </P>

            <H3>Errors and rate limiting</H3>
            <P>
              Errors return a stable machine readable <C>code</C>, a human message and a request id.
              Codes are the contract; messages are not. Exceeding the request budget returns 429
              with a <C>Retry-After</C> header.
            </P>
          </Section>

          <Section id="caching" title="Caching">
            <P>
              Responses carry ordinary HTTP cache directives and a strong <C>ETag</C>. Send it back
              as <C>If-None-Match</C> and an unchanged representation returns <C>304</C> with no
              body.
            </P>
            <Pre>{`Cache-Control: public, max-age=300, must-revalidate
ETag: "e0cf892928f391420d37091455012c66"`}</Pre>
            <P>
              What is unusual is what decides it. <strong>A response is only publicly cacheable if
              every record in it has a known licence.</strong> One <C>unknown</C>-rights record
              makes the whole page <C>no-store</C> — a page is a single representation and cannot be
              partially evicted. Given that most records resolve to <C>unknown</C>, expect{' '}
              <C>no-store</C> to be the common answer.
            </P>
            <P>
              The reasoning is the same as everywhere else on this page: SkillAppMD should not push work
              whose licence it could not determine into caches it does not control.
            </P>
            <P>
              Lifetimes are deliberately short — 300 seconds for a single record, 60 for a
              collection — because an author removal takes effect immediately at the origin but a
              cached copy survives until it expires. The cache lifetime <em>is</em> the removal
              latency, so it is bounded rather than tuned for speed.
            </P>
            <P>
              One consequence worth knowing: a cached response replays the <C>request_id</C> of the
              request that produced it, so several clients can see the same id. For a cached
              response <C>meta.generated_at</C> is the more useful field — it tells you how old the
              representation is.
            </P>
          </Section>

          <Section id="limits" title="Boundaries">
            <P>Four things SkillAppMD will not do, by design rather than by omission.</P>
            <ul className="mt-6 border-t border-[rgba(var(--ink-rgb),0.09)]">
              {LIMITS.map(([title, note]) => (
                <li key={title} className="border-b border-[rgba(var(--ink-rgb),0.09)] py-4">
                  <p className="text-[15px] text-ink">{title}</p>
                  <p className="mt-1.5 text-[14px] leading-[1.6] text-subtle">{note}</p>
                </li>
              ))}
            </ul>
            <P>
              There is also a removal path. If you are the author of an indexed file and you want it
              gone, the request is recorded with its actor, disposition and timestamp, and the bytes
              are deleted. The provenance envelope and the attribution survive, so the record of the
              removal cannot itself be quietly removed.
            </P>
          </Section>

          <Section id="status" title="Status">
            <P>
              The index and the read API are live. The resolver is published on npm, so the install
              command above works. Semantic resolution, capability matching and composition are
              planned and not yet built.
            </P>
            <P>
              The index currently holds a small number of seed records rather than the full corpus.
              The ingestion pipeline has been verified against 10,000 real records and re-runs
              byte-identically, but has not yet been run at scale against the live database. The
              corpus figures on this page come from our own measurements, not from any other index.
            </P>
          </Section>
        </article>
      </div>
    </main>
  )
}
