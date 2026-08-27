import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, resolveOccurrence, compareGrouping } from '../src/deduplicator.js';
import { normalise } from '../src/normaliser.js';
import { parseSkill } from '../src/parser.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { RELATIONSHIP } from '../../skill-core/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const SKILL = '---\nname: alpha\ndescription: Does alpha things.\n---\nAlpha body.';

async function rig() { const s = new SqliteCanonicalStore(':memory:'); await s.migrate({ now: NOW }); return s; }
const disco = (repo, path = 'SKILL.md', extra = {}) => ({
  source: 'gitskills', external_id: `${repo}:${path}`, repo_full_name: repo, path,
  author: repo.split('/')[0], url: `https://github.com/${repo}/blob/HEAD/${path}`,
  discovered_at: NOW, source_payload: { file_sha: 'abc', ...extra } });

async function ingest(store, repo, raw, path = 'SKILL.md', extra = {}) {
  const d = disco(repo, path, extra);
  const parsed = parseSkill(raw);
  const canonical = normalise({ discovery: d, parsed, rawText: raw, repoLicence: 'MIT', now: NOW });
  return await resolveOccurrence({ store, discovery: d, canonical, fingerprints: fingerprint(raw), now: NOW });
}

test('TC-122 REQ-042/REQ-043 fingerprints are computed at both tiers', async () => {
  const f = fingerprint(SKILL);
  assert.match(f.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(f.normalisedHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(f.partitionKey.length, 2);
  assert.match(f.gitBlobSha, /^[0-9a-f]{40}$/);
});

test('TC-123 REQ-044 byte-identical skills in different repos collapse to ONE canonical', async () => {
  const s = await rig();
  const a = await ingest(s, 'alice/repo', SKILL);
  const b = await ingest(s, 'bob/fork', SKILL);
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.canonicalId, a.canonicalId);
  assert.equal(b.relationship, RELATIONSHIP.EXACT_DUPLICATE);
  assert.equal((await s.counts()).canonical, 1);
  s.close();
});

test('TC-124 REQ-046 dedup collapses identity, NOT evidence', async () => {
  const s = await rig();
  const repos = ['a/one', 'b/two', 'c/three', 'd/four'];
  let id;
  for (const r of repos) id = (await ingest(s, r, SKILL)).canonicalId;
  assert.equal((await s.counts()).canonical, 1);
  assert.equal((await s.counts()).occurrences, 4);
  const occ = (await s.listOccurrences({ canonicalId: id })).rows;
  assert.equal(occ.length, 4);
  // Every contributing repository remains individually creditable (NFR-025).
  assert.deepEqual(occ.map((o) => o.repo_full_name).sort(), repos);
  s.close();
});

test('TC-125 REQ-043 a CRLF variant is a NEAR_DUPLICATE, not a second skill', async () => {
  const s = await rig();
  const a = await ingest(s, 'a/one', SKILL);
  const b = await ingest(s, 'b/two', SKILL.replace(/\n/g, '\r\n'));
  assert.equal(b.canonicalId, a.canonicalId);
  assert.equal(b.relationship, RELATIONSHIP.NEAR_DUPLICATE);
  assert.match(b.reason, /normalisation/);
  assert.equal((await s.counts()).canonical, 1, 'line endings must not inflate the canonical count');
  s.close();
});

test('TC-126 REQ-045 same name, different content are DIFFERENT skills', async () => {
  const s = await rig();
  const one = '---\nname: pdf\ndescription: Extract text from PDFs.\n---\nA';
  const two = '---\nname: pdf\ndescription: Fill PDF forms.\n---\nB';
  const a = await ingest(s, 'a/one', one);
  const b = await ingest(s, 'b/two', two);
  assert.notEqual(b.canonicalId, a.canonicalId);
  assert.equal((await s.counts()).canonical, 2, 'name equality is never evidence of duplication');
  s.close();
});

test('TC-127 REQ-016/NFR-009 re-ingesting the same occurrence 10 times changes nothing', async () => {
  const s = await rig();
  for (let i = 0; i < 10; i++) await ingest(s, 'a/one', SKILL);
  assert.equal((await s.counts()).canonical, 1);
  assert.equal((await s.counts()).occurrences, 1);
  s.close();
});

test('TC-128 REQ-046 the same content at two PATHS in one repo is two occurrences', async () => {
  const s = await rig();
  const a = await ingest(s, 'a/one', SKILL, 'skills/x/SKILL.md');
  const b = await ingest(s, 'a/one', SKILL, 'skills/y/SKILL.md');
  assert.equal(b.canonicalId, a.canonicalId);
  assert.equal((await s.counts()).occurrences, 2, 'path is part of occurrence identity (DOM-001)');
  s.close();
});

test('TC-129 REQ-048 fork metadata is recorded as lineage, separate from content equality', async () => {
  const s = await rig();
  const r = await ingest(s, 'b/fork', SKILL, 'SKILL.md', { is_fork: 1 });
  assert.equal(r.lineage.length, 1);
  assert.equal(r.lineage[0].relationship, RELATIONSHIP.FORK);
  assert.equal(r.lineage[0].evidence, 'repos.is_fork');
  s.close();
});

test('TC-130 DEC-012 the git blob sha is reproduced exactly for cross-checking', async () => {
  // Empty blob: `printf '' | git hash-object --stdin`
  assert.equal(fingerprint('').gitBlobSha, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  // Known: "hello\n"
  assert.equal(fingerprint('hello\n').gitBlobSha, 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('TC-131 REQ-047 grouping comparison agrees with itself on synthetic groups', async () => {
  const rows = [
    { content: 'same', file_sha: 'sha-A' },
    { content: 'same', file_sha: 'sha-A' },
    { content: 'other', file_sha: 'sha-B' },
  ];
  const r = compareGrouping(rows);
  assert.equal(r.comparableGroups, 2);
  assert.equal(r.multiMemberGroups, 1);
  assert.equal(r.agreement, 1);
  assert.deepEqual(r.disagreements, []);
});

test('TC-132 REQ-047 a grouping disagreement is REPORTED, never silently reconciled', async () => {
  // Two rows the corpus calls one group, but whose bytes actually differ.
  const rows = [
    { content: 'aaa', file_sha: 'sha-X' },
    { content: 'bbb', file_sha: 'sha-X' },
  ];
  const r = compareGrouping(rows);
  assert.equal(r.agreement, 0);
  assert.equal(r.disagreements.length, 1);
  assert.equal(r.disagreements[0].ourGroups, 2);
});

test('TC-133 NFR-038 dedup resolution refuses an implicit clock', async () => {
  const s = await rig();
  await assert.rejects(async () => resolveOccurrence({ store: s, discovery: disco('a/b'),
    canonical: {}, fingerprints: fingerprint(SKILL) }), /UTC timestamp/);
  s.close();
});

test('TC-134 DEF-003 a non-scalar name or description does not reach a column', async () => {
  // Real corpus case: `description:` opening an empty map. Previously surfaced as
  // "cannot be bound to SQLite parameter 7", 300 rows into an ingestion run.
  const s = await rig();
  const raw = '---\nname: alpha\ndescription:\n  nested:\n    deep: x\n---\nBody.';
  await assert.doesNotReject(async () => ingest(s, 'a/one', raw));
  const row = (await s.cursorScan()).rows[0];
  assert.equal(row.declared_description, null, 'the column holds a scalar or null');
  const declared = JSON.parse(row.declared_json);
  assert.deepEqual(declared.frontmatter.description, { nested: { deep: 'x' } },
    'but the raw value is preserved verbatim (REQ-036)');
  s.close();
});

test('TC-135 DEC-031 the store names the offending field rather than emitting a bind error', async () => {
  const s = await rig();
  const raw = '---\nname: alpha\ndescription: d\n---\nB';
  const d = disco('a/one');
  const canonical = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw,
                                repoLicence: 'MIT', now: NOW });
  canonical.declared.name = { not: 'a scalar' };            // simulate an upstream defect
  await assert.rejects(async () => s.upsertCanonical(canonical), /cannot store field "declared\.name".*object/);
  s.close();
});
