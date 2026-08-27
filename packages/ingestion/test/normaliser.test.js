import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, NORMALISER_VERSION } from '../src/normaliser.js';
import { parseSkill } from '../src/parser.js';
import { originKind, ORIGIN_KIND, RIGHTS_STATE } from '../../skill-core/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const RAW = '---\nname: my-skill\ndescription: Does a thing.\nlicense: MIT\n---\nBody.';
const discovery = (over = {}) => ({
  source: 'gitskills', external_id: 'o/r:SKILL.md', repo_full_name: 'o/r', path: 'SKILL.md',
  author: 'o', url: 'https://github.com/o/r/blob/HEAD/SKILL.md',
  discovered_at: NOW, source_payload: { first_commit_at: '2026-01-01T00:00:00Z' }, ...over });

const build = (over = {}, repoLicence = 'MIT') =>
  normalise({ discovery: discovery(over), parsed: parseSkill(RAW), rawText: RAW, repoLicence, now: NOW });

test('TC-111 REQ-039 normalisation produces a record with mandatory attribution', async () => {
  const c = build();
  assert.equal(c.attribution.repository, 'o/r');
  assert.equal(c.attribution.owner, 'o');
  assert.match(c.attribution.canonical_source_url, /^https:\/\/github\.com\//);
});

test('TC-112 NFR-004 a discovery record without a URL is REJECTED at normalisation', async () => {
  assert.throws(() => build({ url: '' }), /NFR-004/);
  assert.throws(() => build({ repo_full_name: '' }), /NFR-004/);
});

test('TC-113 DOM-006/REQ-040 every field origin is classified as fact or inference', async () => {
  const c = build();
  const kinds = Object.values(c.provenance.field_origins).map(originKind);
  assert.ok(kinds.every(Boolean), 'no unclassifiable origins');
  assert.equal(originKind(c.provenance.field_origins['declared.name']), ORIGIN_KIND.SOURCE_FACT);
  assert.equal(originKind(c.provenance.field_origins['rights.redistributable']),
    ORIGIN_KIND.APPMD_INFERENCE, 'a rights conclusion is ours, not the source\'s');
});

test('TC-114 DEC-006 L2 repository licence and L3 frontmatter claim are recorded separately', async () => {
  const c = build({}, 'MIT');
  assert.equal(c.licence.l2_repository.spdx, 'MIT');
  assert.equal(c.licence.l3_declared.spdx, 'MIT');
  assert.equal(c.licence.l1_dataset.spdx, 'CC-BY-4.0');
});

test('TC-115 DEC-018 no repository licence yields the explicit unknown state', async () => {
  const c = build({}, null);
  assert.equal(c.rights.state, RIGHTS_STATE.UNKNOWN);
  assert.equal(c.rights.redistributable, false);
  assert.equal(c.retentionPolicy, 'process-then-delete', 'unknown gets the shortest retention');
});

test('TC-116 REQ-060 an L2/L3 conflict is flagged and the more restrictive applied', async () => {
  const raw = '---\nname: s\ndescription: d\nlicense: MIT\n---\nb';
  const c = normalise({ discovery: discovery(), parsed: parseSkill(raw), rawText: raw,
                        repoLicence: 'GPL-3.0', now: NOW });
  assert.equal(c.licence.conflict, true);
  assert.equal(c.licence.effective, 'GPL-3.0');
  assert.equal(c.rights.redistributable, false);
});

test('TC-117 REQ-036 unknown frontmatter keys survive into the canonical record', async () => {
  const raw = '---\nname: s\ndescription: d\nx-custom: preserved\n---\nb';
  const c = normalise({ discovery: discovery(), parsed: parseSkill(raw), rawText: raw,
                        repoLicence: 'MIT', now: NOW });
  assert.equal(c.declared.frontmatter['x-custom'], 'preserved');
});

test('TC-118 DOM-006 the inferred compartment exists and is empty in Phase 1', async () => {
  const c = build();
  assert.deepEqual(c.inferred, {}, 'shape exists so AI phases need no schema change');
});

test('TC-119 REQ-039 a parse failure still yields an attributable record', async () => {
  const bad = 'not a skill at all';
  const c = normalise({ discovery: discovery(), parsed: parseSkill(bad), rawText: bad,
                        repoLicence: 'MIT', now: NOW });
  assert.equal(c.frontmatterValid, false);
  assert.equal(c.declared.name, null);
  assert.equal(c.attribution.repository, 'o/r', 'attribution survives a parse failure');
});

test('TC-120 NFR-038 normalisation refuses an implicit clock', async () => {
  assert.throws(() => normalise({ discovery: discovery(), parsed: parseSkill(RAW), rawText: RAW }),
    /UTC timestamp/);
});

test('TC-121 NFR-001 normalisation is deterministic for identical input', async () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
  assert.equal(build().provenance.normaliser_version, NORMALISER_VERSION);
});
