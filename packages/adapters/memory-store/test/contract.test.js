import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCanonicalStore } from '../../sqlite/src/index.js';
import { MemoryCanonicalStore } from '../src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         RemovalService, ReanalysisService } from '../../../ingestion/src/index.js';

/**
 * THE PORTABILITY PROOF (DEC-027, DATABASE.md SS8, G4).
 *
 * One suite, run against two adapters that share NOTHING but the port:
 *   - SqliteCanonicalStore: SQL, a schema, CHECK constraints, migrations
 *   - MemoryCanonicalStore: plain JavaScript maps, no query language at all
 *
 * A Postgres adapter would prove LESS: it shares SQL with SQLite, so a port that
 * leaked SQL would still pass. This pair shares only the interface.
 *
 * The binding condition: these tests exercise skill-core and ingestion UNMODIFIED.
 * If DEC-027's migration path were fiction, this file could not be written.
 */
const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;

const ADAPTERS = [
  ['sqlite', () => { const s = new SqliteCanonicalStore(':memory:'); s.migrate({ now: NOW }); return s; }],
  ['memory', () => { const s = new MemoryCanonicalStore(); s.migrate({ now: NOW }); return s; }],
];

const disco = (repo, path = 'S.md', i = 0) => ({
  source: 'gitskills', external_id: `${repo}:${path}`, repo_full_name: repo, path,
  author: repo.split('/')[0], url: `https://github.com/${repo}/blob/HEAD/${path}`,
  discovered_at: `2026-08-27T13:${String(i % 60).padStart(2, '0')}:00Z`, source_payload: {} });

function ingest(store, repo, raw, { licence = 'MIT', path = 'S.md', i = 0 } = {}) {
  const d = disco(repo, path, i);
  const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw,
                        repoLicence: licence, now: d.discovered_at });
  return { ...resolveOccurrence({ store, discovery: d, canonical: c,
                                  fingerprints: fingerprint(raw), now: NOW }), canonical: c };
}
const skill = (n) => `---\nname: s-${n}\ndescription: Skill ${n}.\n---\nBody ${n}.`;

for (const [name, make] of ADAPTERS) {
  test(`TC-194 [${name}] REQ-054 the same pipeline code drives both adapters`, () => {
    const s = make();
    for (let i = 0; i < 5; i++) ingest(s, `o/r${i}`, skill(i), { i });
    assert.equal(s.counts().canonical, 5);
    assert.equal(s.counts().occurrences, 5);
    s.close();
  });

  test(`TC-195 [${name}] REQ-044 exact duplicates collapse identically`, () => {
    const s = make();
    const a = ingest(s, 'a/one', skill('x'), { i: 0 });
    const b = ingest(s, 'b/two', skill('x'), { i: 1 });
    assert.equal(b.canonicalId, a.canonicalId);
    assert.equal(s.counts().canonical, 1);
    assert.equal(s.counts().occurrences, 2, 'evidence survives in both');
    s.close();
  });

  test(`TC-196 [${name}] REQ-043 near-duplicates collapse identically`, () => {
    const s = make();
    const a = ingest(s, 'a/one', skill('y'), { i: 0 });
    const b = ingest(s, 'b/two', skill('y').replace(/\n/g, '\r\n'), { i: 1 });
    assert.equal(b.canonicalId, a.canonicalId);
    assert.equal(b.relationship, 'NEAR_DUPLICATE');
    s.close();
  });

  test(`TC-197 [${name}] NFR-004 attribution is refused identically`, () => {
    const s = make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: 'MIT', now: NOW });
    c.attribution.repository = '';
    assert.throws(() => s.upsertCanonical(c), /CHECK|constraint|attribution/i,
      'the invariant belongs to the domain, so every adapter upholds it');
    s.close();
  });

  test(`TC-198 [${name}] NFR-006 redistributable without known rights is refused identically`, () => {
    const s = make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: null, now: NOW });
    c.rights = { ...c.rights, redistributable: true };
    assert.throws(() => s.upsertCanonical(c), /CHECK|constraint|redistributable/i);
    s.close();
  });

  test(`TC-199 [${name}] DEF-003 a non-scalar column value is refused identically`, () => {
    const s = make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: 'MIT', now: NOW });
    c.declared.name = { not: 'scalar' };
    assert.throws(() => s.upsertCanonical(c), /cannot store field|constraint/i);
    s.close();
  });

  test(`TC-200 [${name}] NFR-032 cursor pagination walks every record exactly once`, () => {
    const s = make();
    for (let i = 0; i < 25; i++) ingest(s, `o/r${i}`, skill(i), { i });
    const seen = new Set();
    let cursor = null, pages = 0;
    do {
      const page = s.cursorScan({ cursor, limit: 7 });
      page.rows.forEach((r) => seen.add(r.id));
      cursor = page.cursor.next;
      assert.ok(++pages < 20, 'pagination terminates');
    } while (cursor);
    assert.equal(seen.size, 25);
    s.close();
  });

  test(`TC-201 [${name}] INVALID_CURSOR is reported identically`, () => {
    const s = make();
    assert.throws(() => s.cursorScan({ cursor: '!!not-a-cursor!!' }), /INVALID_CURSOR/);
    s.close();
  });

  test(`TC-202 [${name}] REQ-069 search returns the same matches`, () => {
    const s = make();
    for (let i = 0; i < 5; i++) ingest(s, `o/r${i}`, skill(i), { i });
    const r = s.search({ q: 's-3', limit: 10 });
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].declared_name, 's-3');
    s.close();
  });

  test(`TC-203 [${name}] REQ-084 job history behaves identically`, () => {
    const s = make();
    s.recordJob({ jobId: 'j1', skillRef: 'ref', sourceId: 'gitskills', stage: 'PARSED',
                  attempt: 1, status: 'running', startedAt: '2026-08-27T10:00:00Z' });
    s.recordJob({ jobId: 'j1', skillRef: 'ref', sourceId: 'gitskills', stage: 'PARSED',
                  attempt: 1, status: 'succeeded', startedAt: '2026-08-27T99:99:99Z',
                  completedAt: '2026-08-27T10:05:00Z' });
    const j = s.getJob('j1');
    assert.equal(j.status, 'succeeded');
    assert.equal(j.started_at, '2026-08-27T10:00:00Z', 'DEF-001: completing never moves the start time');
    assert.equal(s.listJobs({ skillRef: 'ref' }).length, 1);
    s.close();
  });

  test(`TC-204 [${name}] REQ-063 removal and tombstoning behave identically`, async () => {
    const s = make();
    const r = ingest(s, 'o/r0', skill(0), { i: 0 });
    const svc = new RemovalService({ store: s, clock });
    svc.submit({ requestId: 'rq1', canonicalId: r.canonicalId, repository: 'o/r0',
                 reason: 'no consent', requestedBy: 'author' });
    const res = await svc.action({ requestId: 'rq1', actor: 'op' });
    assert.equal(res.tombstoned, true);
    assert.equal(s.tombstoneCount(), 1);
    assert.equal(s.tombstonedCount(), 1);
    assert.ok(s.getCanonical(r.canonicalId), 'the record is retained, not deleted');
    assert.equal(svc.rebuildReport().servable, 0);
    s.close();
  });

  test(`TC-205 [${name}] REQ-095 re-analysis targeting behaves identically`, () => {
    const s = make();
    const a = ingest(s, 'o/r0', skill(0), { i: 0 });
    const b = ingest(s, 'o/r1', skill(1), { i: 1 });
    const svc = new ReanalysisService({ store: s, clock });
    svc.stamp(a.canonicalId, { scanner: '1.0.0' });
    const plan = svc.plan({ analyser: 'scanner', version: '1.0.0' });
    assert.equal(plan.count, 1, 'only the unstamped record is affected');
    assert.equal(plan.affected[0].id, b.canonicalId);
    s.close();
  });

  test(`TC-206 [${name}] NFR-001 the digest is stable across identical input`, () => {
    const build = () => { const s = make();
      for (let i = 0; i < 10; i++) ingest(s, `o/r${i}`, skill(i), { i });
      const d = s.digest(); s.close(); return d; };
    const a = build(), b = build();
    assert.equal(a.records, 10);
    assert.equal(a.digest, b.digest);
  });
}

test('TC-207 DEC-027 both adapters produce the SAME canonical digest for the same input', () => {
  const digests = ADAPTERS.map(([, make]) => {
    const s = make();
    for (let i = 0; i < 20; i++) ingest(s, `o/r${i}`, skill(i), { i });
    const d = s.digest(); s.close(); return d;
  });
  assert.equal(digests[0].records, digests[1].records);
  assert.equal(digests[0].digest, digests[1].digest,
    'a SQL store and a plain-map store agree byte for byte - the port carries no engine semantics');
});
