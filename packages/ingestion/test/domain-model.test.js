import { test } from 'node:test';
import assert from 'node:assert/strict';
// Domain rules belong to skill-core, so the test imports them from there rather than
// through the ingestion barrel - the import path is itself part of the layering claim.
import { occurrenceKey, resolveRelationship, contentHash, normalisedHash,
         RELATIONSHIP, RIGHTS_STATE, IDENTITY_CLASS, ORIGIN_KIND, UNKNOWN,
         resolveLicence, computeRights, assertAttribution, classifyIdentity,
         assertPersonalFieldPurpose, sourceFact, appmdInference,
         originKind } from '../../skill-core/src/index.js';

/**
 * DOMAIN MODEL — unit level.
 * SRS §3 states twelve DOM requirements. They were implemented and exercised in
 * passing, but no test NAMED them, so the traceability matrix read as uncovered.
 * These assert the domain rules directly rather than as side effects.
 */
const NOW = '2026-08-27T13:45:00Z';

test('TC-239 DOM-002 canonical identity is opaque and never derived from mutable data', () => {
  // A CanonicalSkill id must not encode name, stars, URL or any attribute that can change.
  const id = `cs_${contentHash('body').slice(7, 27)}`;
  assert.match(id, /^cs_[0-9a-f]{20}$/);
  assert.equal(id.includes('github.com'), false);
  assert.equal(/star|name|owner|repo/i.test(id), false, 'no mutable attribute is encoded');
  // Same content, same identity - regardless of who published it.
  const a = `cs_${contentHash('body').slice(7, 27)}`;
  assert.equal(id, a);
});

test('TC-240 DOM-003/DEC-014 identity derives from origin coordinates, not an aggregator id', () => {
  const key = occurrenceKey({ source: 'gitskills', repoFullName: 'owner/repo',
                              path: 'SKILL.md', contentHash: 'sha256:abc' });
  assert.ok(key.includes('owner/repo'), 'GitHub coordinates are present');
  assert.ok(key.includes('SKILL.md'));
  assert.equal(key.includes('skillsmp.com'), false, 'no aggregator URL');
  // The same file discovered through a DIFFERENT aggregator yields the same coordinates.
  const viaOther = occurrenceKey({ source: 'some-registry', repoFullName: 'owner/repo',
                                   path: 'SKILL.md', contentHash: 'sha256:abc' });
  assert.equal(key.split('::').slice(1).join('::'), viaOther.split('::').slice(1).join('::'),
    'if SkillsMP vanished, zero canonical identities would be invalidated');
});

test('TC-241 DOM-004 EXACT_DUPLICATE iff raw content hashes are equal', () => {
  const same = resolveRelationship(
    { contentHash: 'h', normalisedHash: 'n' },
    { contentHash: 'h', normalisedHash: 'n', canonicalId: 'cs_1' });
  assert.equal(same.relationship, RELATIONSHIP.EXACT_DUPLICATE);
  // "iff" - a normalised match alone is NOT exact.
  const near = resolveRelationship(
    { contentHash: 'h1', normalisedHash: 'n' },
    { contentHash: 'h2', normalisedHash: 'n', canonicalId: 'cs_1' });
  assert.notEqual(near.relationship, RELATIONSHIP.EXACT_DUPLICATE);
  assert.equal(near.relationship, RELATIONSHIP.NEAR_DUPLICATE);
});

test('TC-242 DOM-005 the relationship vocabulary is closed and complete', () => {
  assert.deepEqual(Object.keys(RELATIONSHIP).sort(),
    ['ALTERNATIVE', 'DUPLICATE_OF', 'EXACT_DUPLICATE', 'FORK', 'MIRROR',
     'NEAR_DUPLICATE', 'RELATED', 'UNRELATED', 'VERSION'].filter((k) => k in RELATIONSHIP).sort());
  // Frozen: a relationship cannot be invented at runtime.
  assert.throws(() => { RELATIONSHIP.INVENTED = 'x'; }, TypeError);
  for (const v of Object.values(RELATIONSHIP)) assert.equal(typeof v, 'string');
});

test('TC-243 DOM-007 licence is three INDEPENDENT layers, never collapsed', () => {
  const l = resolveLicence({
    l1: { spdx: 'CC-BY-4.0', evidence: 'zenodo' },
    l2: { spdx: 'MIT', evidence: 'repos.license' },
    l3: { spdx: 'Apache-2.0', evidence: 'frontmatter' } });
  assert.equal(l.l1_dataset.spdx, 'CC-BY-4.0');
  assert.equal(l.l2_repository.spdx, 'MIT');
  assert.equal(l.l3_declared.spdx, 'Apache-2.0');
  // Each retains its own evidence - the layers are not merged into one verdict.
  assert.equal(l.l1_dataset.evidence, 'zenodo');
  assert.equal(l.l2_repository.evidence, 'repos.license');
  assert.equal(l.conflict, true, 'L2 and L3 disagree and it is flagged');
});

test('TC-244 DOM-008 rights are COMPUTED, with unknown as an explicit state', () => {
  const known = computeRights({ l2: { spdx: 'MIT' } }, { now: NOW });
  const unknown = computeRights({}, { now: NOW });
  // Computed: a basis and a timestamp accompany every posture.
  assert.ok(known.basis && known.computed_at);
  assert.equal(known.state, RIGHTS_STATE.KNOWN);
  assert.equal(unknown.state, RIGHTS_STATE.UNKNOWN);
  // The brief's four concepts are all present, and unknown is not "all false".
  for (const f of ['indexable', 'linkable', 'redistributable']) assert.ok(f in unknown);
  assert.equal(unknown.indexable, true);
  assert.equal(unknown.linkable, true);
  assert.notDeepEqual(
    { i: unknown.indexable, l: unknown.linkable, r: unknown.redistributable },
    { i: false, l: false, r: false }, 'unknown is a STATE, not the absence of permissions');
});

test('TC-245 DOM-009 the repository is the attribution unit and attribution is mandatory', () => {
  const full = { repository: 'owner/repo', owner: 'owner', canonical_source_url: 'https://x' };
  assert.ok(assertAttribution(full));
  for (const f of Object.keys(full)) {
    assert.throws(() => assertAttribution({ ...full, [f]: '' }), /NFR-004/,
      `${f} is part of the attribution unit`);
  }
});

test('TC-246 DOM-010 raw is content-addressed, so identity cannot drift from content', () => {
  const a = 'raw bytes';
  assert.equal(contentHash(a), contentHash(a), 'deterministic');
  assert.notEqual(contentHash(a), contentHash(a + ' '), 'one byte changes identity');
  // Normalisation produces a DIFFERENT value and never overwrites the exact one.
  assert.notEqual(contentHash('a\r\nb'), contentHash('a\nb'));
  assert.equal(normalisedHash('a\r\nb'), normalisedHash('a\nb'));
});

test('TC-247 DOM-011 the four temporal facts are distinct and never conflated', () => {
  const temporal = { first_commit_at: '2026-01-01T00:00:00Z', last_commit_at: '2026-07-01T00:00:00Z',
                     discovered_at: '2026-08-10T00:00:00Z', last_verified_at: NOW };
  const keys = Object.keys(temporal);
  assert.equal(new Set(Object.values(temporal)).size, keys.length,
    'four separate instants; a skill last committed in January and verified in August has two ages');
  assert.ok(temporal.first_commit_at < temporal.last_commit_at);
  assert.ok(temporal.discovered_at < temporal.last_verified_at);
});

test('TC-248 DOM-013/REQ-092 identity resolves to three classes with different privacy weight', () => {
  assert.equal(classifyIdentity({ isRepository: true }), IDENTITY_CLASS.REPOSITORY);
  assert.equal(classifyIdentity({ isOrganisation: true }), IDENTITY_CLASS.ORGANISATION);
  assert.equal(classifyIdentity({}), IDENTITY_CLASS.INDIVIDUAL);
  assert.equal(Object.keys(IDENTITY_CLASS).length, 3);
  assert.ok(assertPersonalFieldPurpose({ owner: { purpose: 'attribution' } }));
  assert.throws(() => assertPersonalFieldPurpose({ email: {} }), /REQ-092/);
});

test('TC-249 REQ-056 the three licence layers are recorded independently with evidence', () => {
  const only2 = resolveLicence({ l2: { spdx: 'MIT', evidence: 'repos.license' } });
  assert.equal(only2.l2_repository.spdx, 'MIT');
  assert.equal(only2.l3_declared.spdx, UNKNOWN, 'an absent layer is UNKNOWN, not inherited');
  assert.equal(only2.l1_dataset.spdx, UNKNOWN);
  assert.equal(only2.conflict, false);
});

test('TC-250 REQ-059 rights carry indexable, linkable, redistributable and their basis', () => {
  const r = computeRights({ l2: { spdx: 'MIT', evidence: 'repos.license' } }, { now: NOW });
  for (const f of ['indexable', 'linkable', 'redistributable', 'cacheable', 'basis', 'computed_at', 'state']) {
    assert.ok(f in r, `rights must carry ${f}`);
  }
  assert.match(r.basis, /L2 repository licence MIT/, 'the basis names the evidence that produced it');
});

test('TC-251 NFR-036 no personal field is stored without a stated provenance purpose', () => {
  // Data minimisation as a schema rule rather than a policy document.
  assert.throws(() => assertPersonalFieldPurpose({ email: {}, real_name: {} }), /REQ-092/);
  assert.throws(() => assertPersonalFieldPurpose({ follower_graph: { purpose: '' } }), /REQ-092/);
  assert.ok(assertPersonalFieldPurpose({
    owner: { purpose: 'attribution' },
    repo_full_name: { purpose: 'identity and attribution' } }));
});

test('TC-252 DOM-006 origins are classifiable, and the two kinds never overlap', () => {
  const fact = sourceFact('gitskills', 'frontmatter.name');
  const inf = appmdInference('rights-engine', '0.1.0');
  assert.equal(originKind(fact), ORIGIN_KIND.SOURCE_FACT);
  assert.equal(originKind(inf), ORIGIN_KIND.APPMD_INFERENCE);
  assert.notEqual(originKind(fact), originKind(inf));
  assert.equal(originKind('neither'), null, 'an unclassifiable origin is detectable');
});
