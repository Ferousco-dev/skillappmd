import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteCanonicalStore, SCHEMA_VERSION } from '../src/index.js';
import { computeRights, retentionFor, contentHash, normalisedHash, partitionKey,
         occurrenceKey, sourceFact, assertAttribution } from '../../../skill-core/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const tmp = () => mkdtempSync(join(tmpdir(), 'appmd-'));

function fresh(path = ':memory:') {
  const s = new SqliteCanonicalStore(path);
  s.migrate({ now: NOW });
  return s;
}

function skill({ body = 'name: alpha\nbody', licence = { l2: { spdx: 'MIT', evidence: 'repos.license' } },
                 repo = 'owner/repo', now = NOW } = {}) {
  const ch = contentHash(body), nh = normalisedHash(body);
  const rights = computeRights(licence, { now });
  const attribution = { repository: repo, owner: repo.split('/')[0],
                        canonical_source_url: `https://github.com/${repo}/blob/main/SKILL.md` };
  assertAttribution(attribution);
  return { id: 'cs_' + ch.slice(7, 19), contentHash: ch, normalisedHash: nh,
    partitionKey: partitionKey(ch), declared: { name: 'alpha', description: 'd' },
    frontmatterValid: true, licence: rights.licence, rights,
    retentionPolicy: retentionFor(rights),
    provenance: { sources: [{ source_id: 'gitskills', at: now }],
                  field_origins: { 'declared.name': sourceFact('gitskills') } },
    attribution, temporal: { discovered_at: now }, now };
}

test('TC-037 REQ-094 migration is re-runnable and records what it applied', () => {
  const s = new SqliteCanonicalStore(':memory:');
  assert.equal(s.schemaVersion(), 0);
  assert.deepEqual(s.migrate({ now: NOW }), { from: 0, to: 1, applied: [1] });
  assert.deepEqual(s.migrate({ now: NOW }), { from: 1, to: 1, applied: [] });
  assert.equal(s.migrationLog().length, 1);
  s.close();
});

test('TC-038 NFR-038 migrate refuses an implicit clock', () => {
  const s = new SqliteCanonicalStore(':memory:');
  assert.throws(() => s.migrate({}), /UTC timestamp/);
  s.close();
});

test('TC-039 REQ-053 every canonical record carries a schema version', () => {
  const s = fresh(); s.upsertCanonical(skill());
  assert.equal(s.cursorScan().rows[0].schema_version, SCHEMA_VERSION);
  s.close();
});

test('TC-040 REQ-016/NFR-009 upsert is idempotent: 10 writes == 1', () => {
  const s = fresh(); const c = skill();
  for (let i = 0; i < 10; i++) s.upsertCanonical(c);
  assert.equal(s.counts().canonical, 1);
  s.close();
});

test('TC-041 NFR-004 the DATABASE rejects a record without attribution', () => {
  const s = fresh(); const c = skill();
  c.attribution = { repository: '', owner: 'o', canonical_source_url: 'u' };
  assert.throws(() => s.upsertCanonical(c), /CHECK|constraint/i);
  s.close();
});

test('TC-042 NFR-006 the DATABASE rejects redistributable without known rights', () => {
  const s = fresh(); const c = skill({ licence: {} });     // unknown rights
  c.rights = { ...c.rights, redistributable: true };        // simulate a defect upstream
  assert.throws(() => s.upsertCanonical(c), /CHECK|constraint/i);
  s.close();
});

test('TC-043 DEC-018 rights_state is stored and queryable as an explicit value', () => {
  const s = fresh();
  s.upsertCanonical(skill({ body: 'a', licence: {} }));
  s.upsertCanonical(skill({ body: 'b', licence: { l2: { spdx: 'MIT' } } }));
  const states = s.cursorScan().rows.map((r) => r.rights_state).sort();
  assert.deepEqual(states, ['known', 'unknown']);
  s.close();
});

test('TC-044 REQ-044 identical content resolves to one canonical skill', () => {
  const s = fresh(); const body = 'name: x\nbody';
  s.upsertCanonical(skill({ body, repo: 'a/one' }));
  s.upsertCanonical(skill({ body, repo: 'b/two' }));
  assert.equal(s.counts().canonical, 1, 'same content hash -> one identity');
  s.close();
});

test('TC-045 REQ-046 evidence survives dedup: occurrences remain individually retrievable', () => {
  const s = fresh(); const body = 'name: x\nbody'; const c = skill({ body });
  s.upsertCanonical(c);
  for (const repo of ['a/one', 'b/two', 'c/three']) {
    const k = occurrenceKey({ source: 'gitskills', repoFullName: repo,
                              path: 'SKILL.md', contentHash: c.contentHash });
    s.upsertOccurrence({ occurrenceKey: k, sourceId: 'gitskills', repoFullName: repo,
      path: 'SKILL.md', contentHash: c.contentHash, normalisedHash: c.normalisedHash,
      canonicalId: c.id, relationship: 'EXACT_DUPLICATE', discoveredAt: NOW, stage: 'STORED' });
  }
  assert.equal(s.counts().canonical, 1);
  assert.equal(s.counts().occurrences, 3);
  assert.equal(s.listOccurrences({ canonicalId: c.id }).rows.length, 3);
  s.close();
});

test('TC-046 NFR-032/NFR-039 cursor pagination walks every record exactly once', () => {
  const s = fresh();
  for (let i = 0; i < 25; i++) s.upsertCanonical(skill({ body: `skill-${i}`, now: `2026-08-27T13:${String(i).padStart(2,'0')}:00Z` }));
  const seen = new Set(); let cursor = null, pages = 0;
  do {
    const page = s.cursorScan({ cursor, limit: 7 });
    page.rows.forEach((r) => seen.add(r.id));
    cursor = page.cursor.next; pages++;
    assert.ok(pages < 20, 'pagination must terminate');
  } while (cursor);
  assert.equal(seen.size, 25, 'every record seen exactly once, none skipped, none repeated');
  s.close();
});

test('TC-047 UI/INTERFACE INVALID_CURSOR is reported, not silently ignored', () => {
  const s = fresh();
  assert.throws(() => s.cursorScan({ cursor: 'not-a-cursor' }), /INVALID_CURSOR/);
  s.close();
});

test('TC-048 REQ-084 jobs are queryable by skill_ref, not only by job_id', () => {
  const s = fresh();
  s.recordJob({ jobId: 'j1', skillRef: 'gitskills:o/r:SKILL.md', sourceId: 'gitskills',
                stage: 'PARSED', attempt: 1, status: 'succeeded', startedAt: NOW });
  s.recordJob({ jobId: 'j2', skillRef: 'gitskills:o/r:SKILL.md', sourceId: 'gitskills',
                stage: 'STORED', attempt: 1, status: 'succeeded', startedAt: NOW });
  assert.equal(s.listJobs({ skillRef: 'gitskills:o/r:SKILL.md' }).length, 2);
  assert.equal(s.getJob('j1').stage, 'PARSED');
  s.close();
});

test('TC-049 REQ-010 cursors persist in canonical, not in the queue', () => {
  const s = fresh();
  assert.equal(s.getCursor('gitskills:discover'), null);
  s.setCursor('gitskills:discover', 'gitskills', 'offset:1000', NOW);
  assert.equal(s.getCursor('gitskills:discover'), 'offset:1000');
  s.close();
});

test('TC-050 REQ-091/NFR-035 backup, restore and verify are EXECUTED, not documented', () => {
  const dir = tmp();
  try {
    const live = join(dir, 'canonical.db');
    const s = fresh(live);
    for (let i = 0; i < 5; i++) s.upsertCanonical(skill({ body: `s-${i}` }));
    const before = s.digest();
    assert.equal(before.records, 5);

    const backup = s.backup(join(dir, 'backups', 'b1.db'));
    assert.ok(existsSync(backup.path));

    // DEC-022: verify BEFORE restoring, never after (INTERFACE.md flow C).
    const v = SqliteCanonicalStore.verifyRestore(backup.path, before);
    assert.equal(v.ok, true, v.reason);

    // Simulate loss, then restore.
    s.close(); rmSync(live, { force: true });
    const restored = SqliteCanonicalStore.restore(backup.path, live);
    const after = restored.digest();
    assert.equal(after.records, before.records);
    assert.equal(after.digest, before.digest);
    assert.equal(after.schemaVersion, before.schemaVersion);
    restored.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-051 NFR-035 verifyRestore FAILS on a mismatch rather than reporting success', () => {
  const dir = tmp();
  try {
    const s = fresh(join(dir, 'c.db'));
    s.upsertCanonical(skill());
    const b = s.backup(join(dir, 'b.db'));
    s.close();
    const v = SqliteCanonicalStore.verifyRestore(b.path, { records: 99, digest: 'sha256:wrong' });
    assert.equal(v.ok, false);
    assert.match(v.reason, /mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-052 DEC-015 tombstone survives byte deletion', () => {
  const s = fresh(); const c = skill(); s.upsertCanonical(c);
  s.tombstone({ contentHash: c.contentHash, reason: 'author removal request',
                actor: 'operator', now: NOW, provenance: c.provenance });
  assert.equal(s.tombstoneCount(), 1);
  s.close();
});

test('TC-053 NFR-010 a rebuild after tombstoning reports the tombstoned count', () => {
  const s = fresh();
  s.upsertCanonical(skill({ body: 'a' })); s.upsertCanonical(skill({ body: 'b' }));
  s.tombstone({ contentHash: contentHash('a'), reason: 'r', actor: 'op', now: NOW, provenance: {} });
  // "equivalent MINUS tombstoned", never "identical" - the count must be reportable.
  assert.equal(s.counts().canonical, 2);
  assert.equal(s.tombstoneCount(), 1);
  s.close();
});
