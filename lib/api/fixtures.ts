import type { Attribution, Envelope, Occurrence, Skill, Source } from './types'

/**
 * Development fixtures.
 *
 * These exist because three of the five endpoints in API.md do not exist yet
 * and `apps/api/src/router.js` has no HTTP server bound. They are NOT a mock
 * backend: nothing here is served over HTTP, and the shapes are transcribed
 * from the documented envelope so that swapping to live calls is a one-line
 * change in each api module.
 *
 * Rules followed here:
 *   - No field appears that API.md does not define.
 *   - `inferred` is empty, because Phase 1 emits no inferences (API.md §3).
 *   - `rights.state` covers all three values, including `unknown`, since
 *     distinguishing "we do not know" from "we know you may not" is the whole
 *     point of DEC-018 and the UI has to be built against it.
 *
 * Delete this file once the endpoints land.
 */

export const FIXTURES_ENABLED = process.env.NEXT_PUBLIC_API_FIXTURES !== 'false'

const attribution = (owner: string, repo: string): Attribution => ({
  repository: `${owner}/${repo}`,
  owner,
  canonical_source_url: `https://github.com/${owner}/${repo}`,
})

const NOTICE =
  'Skills are indexed from public repositories. Each is subject to its own repository licence. SkillAppMD does not certify or verify any skill.'

type Seed = {
  id: string
  name: string
  description: string
  owner: string
  repo: string
  state: Skill['rights']['state']
  redistributable: boolean
  basis: string
  /** How many times this skill was seen across the corpus. */
  occurrences: number
}

/**
 * Weighted towards `unknown`, which reflects the corpus: most public
 * repositories carry no machine-readable licence for an individual file.
 */
const SEEDS: Seed[] = [
  { id: 'sk_01', name: 'frontend-design', description: 'Guidance for visual design when building or reshaping a user interface.', owner: 'anthropics', repo: 'skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to MIT', occurrences: 8421 },
  { id: 'sk_02', name: 'pdf-extract', description: 'Extract text and tables from PDF documents, including scanned pages.', owner: 'anthropics', repo: 'skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to MIT', occurrences: 6180 },
  { id: 'sk_03', name: 'commit-message', description: 'Write conventional commit messages from a staged diff.', owner: 'octo-tools', repo: 'agent-kit', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 3902 },
  { id: 'sk_04', name: 'sql-review', description: 'Review SQL migrations for locking, index coverage and rollback safety.', owner: 'dataworks', repo: 'db-skills', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 2744 },
  { id: 'sk_05', name: 'terraform-plan-audit', description: 'Summarise a Terraform plan and flag destructive or drift-inducing changes.', owner: 'hashi-community', repo: 'iac-skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to Apache-2.0', occurrences: 1988 },
  { id: 'sk_06', name: 'incident-timeline', description: 'Build an incident timeline from logs, alerts and chat transcripts.', owner: 'sre-collective', repo: 'oncall', state: 'unknown', redistributable: false, basis: 'Licence file present but unrecognised', occurrences: 1533 },
  { id: 'sk_07', name: 'a11y-audit', description: 'Audit a page for contrast, focus order, landmarks and labelling.', owner: 'a11y-guild', repo: 'skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to MIT', occurrences: 1401 },
  { id: 'sk_08', name: 'release-notes', description: 'Draft release notes grouped by change type from a commit range.', owner: 'shipfast', repo: 'devx', state: 'known', redistributable: false, basis: 'Repository LICENSE forbids redistribution', occurrences: 1120 },
  { id: 'sk_09', name: 'flaky-test-triage', description: 'Identify flaky tests from CI history and propose a stabilisation order.', owner: 'testlab', repo: 'ci-skills', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 964 },
  { id: 'sk_10', name: 'threat-model', description: 'Produce a STRIDE threat model for a described system boundary.', owner: 'secops', repo: 'security-skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to BSD-3-Clause', occurrences: 812 },
  { id: 'sk_11', name: 'api-diff', description: 'Compare two OpenAPI documents and classify breaking changes.', owner: 'contractlab', repo: 'openapi-tools', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 655 },
  { id: 'sk_12', name: 'k8s-debug', description: 'Diagnose a failing pod from events, logs and resource limits.', owner: 'cloudnative', repo: 'k8s-skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to Apache-2.0', occurrences: 588 },
  { id: 'sk_13', name: 'changelog-lint', description: 'Check a changelog against Keep a Changelog conventions.', owner: 'octo-tools', repo: 'agent-kit', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 431 },
  { id: 'sk_14', name: 'query-explain', description: 'Explain a slow query plan and suggest index changes.', owner: 'dataworks', repo: 'db-skills', state: 'unknown', redistributable: false, basis: 'No licence file detected in repository', occurrences: 377 },
  { id: 'sk_15', name: 'dockerfile-slim', description: 'Reduce image size by reordering layers and pruning build dependencies.', owner: 'cloudnative', repo: 'k8s-skills', state: 'known', redistributable: true, basis: 'Repository LICENSE resolved to Apache-2.0', occurrences: 298 },
  { id: 'sk_16', name: 'prompt-regression', description: 'Detect regressions between two prompt revisions over a fixed suite.', owner: 'evalworks', repo: 'llm-skills', state: 'known', redistributable: false, basis: 'Repository LICENSE is source-available, not redistributable', occurrences: 212 },
]

/**
 * Shaped against LIVE API output, not against the docs.
 *
 * These previously omitted `attribution`, `identity`, `licence` and `content`, which let
 * the UI compile and pass while depending on fields the API does not send — and forced
 * SkillResult to synthesise attribution locally. A fixture that does not match the real
 * response is worse than no fixture: it makes a broken integration look tested.
 */
export const fixtureSkills: Skill[] = SEEDS.map(seed => ({
  id: seed.id,
  schema_version: 3,
  declared: { name: seed.name, description: seed.description },
  inferred: {},
  identity: {
    content_hash: `sha256:${seed.id.padEnd(64, '0')}`,
    normalised_hash: `sha256:${seed.id.padEnd(64, '1')}`,
  },
  licence: {
    l1_dataset: { spdx: 'CC-BY-4.0', evidence: 'dataset:gitskills' },
    l2_repository: { spdx: seed.state === 'known' ? 'MIT' : 'UNKNOWN', evidence: 'repos.license' },
    l3_declared: { spdx: 'UNKNOWN', evidence: null },
    conflict: false,
  },
  rights: { state: seed.state, redistributable: seed.redistributable, basis: seed.basis },
  attribution: attribution(seed.owner, seed.repo),
  content: null,
  content_available: false,
}))

const seedById = new Map(SEEDS.map(seed => [seed.id, seed]))

export const fixtureOccurrenceCount = (id: string) => seedById.get(id)?.occurrences ?? 0

export const fixtureAttribution = (id: string): Attribution => {
  const seed = seedById.get(id)
  return seed ? attribution(seed.owner, seed.repo) : attribution('unknown', 'unknown')
}

let requestCounter = 0

function meta() {
  requestCounter += 1
  return {
    request_id: `fixture-${requestCounter.toString().padStart(4, '0')}`,
    generated_at: new Date().toISOString(),
  }
}

/**
 * Real cursor pagination rather than a slice by index, so the UI is exercised
 * against opaque cursors exactly as NFR-032 requires. The cursor encodes the id
 * of the last item returned, mirroring the documented `(sort_key, id)`.
 */
export function paginate<T extends { id: string }>(
  items: T[],
  cursor: string | null | undefined,
  limit: number
): { page: T[]; next: string | null } {
  const start = cursor ? items.findIndex(item => item.id === cursor) + 1 : 0
  const page = items.slice(start, start + limit)
  const last = page[page.length - 1]
  const more = start + limit < items.length
  return { page, next: more && last ? last.id : null }
}

export function fixtureListSkills(cursor?: string | null, limit = 8): Envelope<Skill[]> {
  const { page, next } = paginate(fixtureSkills, cursor, limit)
  return {
    data: page,
    meta: meta(),
    cursor: { next, limit },
    // Collection-level attribution names the index itself; per-record
    // attribution is resolved per skill.
    notice: NOTICE,
  }
}

export function fixtureSearch(q: string, cursor?: string | null, limit = 8): Envelope<Skill[]> {
  const needle = q.trim().toLowerCase()
  const matches = needle
    ? fixtureSkills.filter(skill => {
        const seed = seedById.get(skill.id)
        return (
          skill.declared.name.toLowerCase().includes(needle) ||
          skill.declared.description.toLowerCase().includes(needle) ||
          (seed ? `${seed.owner}/${seed.repo}`.toLowerCase().includes(needle) : false)
        )
      })
    : []
  const { page, next } = paginate(matches, cursor, limit)
  return {
    data: page,
    meta: meta(),
    cursor: { next, limit },
    notice: NOTICE,
  }
}

export function fixtureGetSkill(id: string): Envelope<Skill> | null {
  const skill = fixtureSkills.find(item => item.id === id)
  if (!skill) return null
  return {
    data: skill,
    meta: meta(),
    notice: NOTICE,
  }
}

/**
 * A source is identified by its `owner/repo` slug here. The real identifier
 * scheme is not defined in API.md, so this is a fixture convention only.
 */
export function fixtureGetSource(id: string): Envelope<Source> | null {
  const seed = SEEDS.find(item => `${item.owner}/${item.repo}` === id)
  if (!seed) return null
  return {
    data: { id },
    meta: meta(),
    notice: NOTICE,
  }
}

/** Skills observed under one repository. Derived locally; see the note below. */
export function fixtureSkillsFromSource(id: string): Skill[] {
  const ids = new Set(
    SEEDS.filter(seed => `${seed.owner}/${seed.repo}` === id).map(seed => seed.id)
  )
  return fixtureSkills.filter(skill => ids.has(skill.id))
}

export function fixtureOccurrences(
  id: string,
  cursor?: string | null,
  limit = 10
): Envelope<Occurrence[]> {
  const total = fixtureOccurrenceCount(id)
  const all: Occurrence[] = Array.from({ length: Math.min(total, 40) }, (_, index) => ({
    id: `${id}_occ_${index + 1}`,
  }))
  const { page, next } = paginate(all, cursor, limit)
  return {
    data: page,
    meta: meta(),
    cursor: { next, limit },
    notice: NOTICE,
  }
}
