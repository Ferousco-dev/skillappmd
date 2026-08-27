import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCanonicalStore } from '../../sqlite/src/index.js';
import { DeferredMemoryCanonicalStore } from '../../deferred-store/src/index.js';
import { createD1CanonicalStore } from '../../d1/src/index.js';
import { FakeD1Database } from '../../d1/src/fake-d1.js';
import { MemoryCanonicalStore } from '../src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         RemovalService, ReanalysisService, rebuildSearchIndex } from '../../../ingestion/src/index.js';

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
  ['sqlite', async () => { const s = new SqliteCanonicalStore(':memory:'); await s.migrate({ now: NOW }); return s; }],
  ['memory', async () => { const s = new MemoryCanonicalStore(); await s.migrate({ now: NOW }); return s; }],
  // DEF-009 / CR-008: an adapter that CANNOT be satisfied by synchronous code. Without
  // it, this suite would go on proving that three synchronous stores agree with each
  // other, which is what let the port ship with a synchrony assumption in the first place.
  ['deferred', async () => { const s = new DeferredMemoryCanonicalStore(); await s.migrate({ now: NOW }); return s; }],
  // CR-011: the SAME store logic driven through D1's call shape - .bind() binding,
  // .first()/.all() returning Promises, .all() wrapping rows in { results }. Backed by
  // real SQLite, so every test below runs against it unchanged. This proves the ADAPTATION,
  // not D1 itself: no network, no row limits, no query timeouts (RSK-011).
  ['d1', async () => { const s = createD1CanonicalStore(new FakeD1Database()); await s.migrate({ now: NOW }); return s; }],
];

const disco = (repo, path = 'S.md', i = 0) => ({
  source: 'gitskills', external_id: `${repo}:${path}`, repo_full_name: repo, path,
  author: repo.split('/')[0], url: `https://github.com/${repo}/blob/HEAD/${path}`,
  discovered_at: `2026-08-27T13:${String(i % 60).padStart(2, '0')}:00Z`, source_payload: {} });

async function ingest(store, repo, raw, { licence = 'MIT', path = 'S.md', i = 0 } = {}) {
  const d = disco(repo, path, i);
  const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw,
                        repoLicence: licence, now: d.discovered_at });
  return { ...(await resolveOccurrence({ store, discovery: d, canonical: c,
                                         fingerprints: fingerprint(raw), now: NOW })), canonical: c };
}
const skill = (n) => `---\nname: s-${n}\ndescription: Skill ${n}.\n---\nBody ${n}.`;

for (const [name, make] of ADAPTERS) {
  test(`TC-194 [${name}] REQ-054 the same pipeline code drives both adapters`, async () => {
    const s = await make();
    for (let i = 0; i < 5; i++) await ingest(s, `o/r${i}`, skill(i), { i });
    assert.equal((await s.counts()).canonical, 5);
    assert.equal((await s.counts()).occurrences, 5);
    s.close();
  });

  test(`TC-195 [${name}] REQ-044 exact duplicates collapse identically`, async () => {
    const s = await make();
    const a = await ingest(s, 'a/one', skill('x'), { i: 0 });
    const b = await ingest(s, 'b/two', skill('x'), { i: 1 });
    assert.equal(b.canonicalId, a.canonicalId);
    assert.equal((await s.counts()).canonical, 1);
    assert.equal((await s.counts()).occurrences, 2, 'evidence survives in both');
    s.close();
  });

  test(`TC-196 [${name}] REQ-043 near-duplicates collapse identically`, async () => {
    const s = await make();
    const a = await ingest(s, 'a/one', skill('y'), { i: 0 });
    const b = await ingest(s, 'b/two', skill('y').replace(/\n/g, '\r\n'), { i: 1 });
    assert.equal(b.canonicalId, a.canonicalId);
    assert.equal(b.relationship, 'NEAR_DUPLICATE');
    s.close();
  });

  test(`TC-197 [${name}] NFR-004 attribution is refused identically`, async () => {
    const s = await make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: 'MIT', now: NOW });
    c.attribution.repository = '';
    await assert.rejects(async () => s.upsertCanonical(c), /CHECK|constraint|attribution/i,
      'the invariant belongs to the domain, so every adapter upholds it');
    s.close();
  });

  test(`TC-198 [${name}] NFR-006 redistributable without known rights is refused identically`, async () => {
    const s = await make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: null, now: NOW });
    c.rights = { ...c.rights, redistributable: true };
    await assert.rejects(async () => s.upsertCanonical(c), /CHECK|constraint|redistributable/i);
    s.close();
  });

  test(`TC-199 [${name}] DEF-003 a non-scalar column value is refused identically`, async () => {
    const s = await make();
    const d = disco('o/r');
    const c = normalise({ discovery: d, parsed: parseSkill(skill(1)), rawText: skill(1),
                          repoLicence: 'MIT', now: NOW });
    c.declared.name = { not: 'scalar' };
    await assert.rejects(async () => s.upsertCanonical(c), /cannot store field|constraint/i);
    s.close();
  });

  test(`TC-200 [${name}] NFR-032 cursor pagination walks every record exactly once`, async () => {
    const s = await make();
    for (let i = 0; i < 25; i++) await ingest(s, `o/r${i}`, skill(i), { i });
    const seen = new Set();
    let cursor = null, pages = 0;
    do {
      const page = await s.cursorScan({ cursor, limit: 7 });
      page.rows.forEach((r) => seen.add(r.id));
      cursor = page.cursor.next;
      assert.ok(++pages < 20, 'pagination terminates');
    } while (cursor);
    assert.equal(seen.size, 25);
    s.close();
  });

  test(`TC-201 [${name}] INVALID_CURSOR is reported identically`, async () => {
    const s = await make();
    await assert.rejects(async () => s.cursorScan({ cursor: '!!not-a-cursor!!' }), /INVALID_CURSOR/);
    s.close();
  });

  test(`TC-202 [${name}] REQ-069 search returns the same matches after a rebuild`, async () => {
    const s = await make();
    for (let i = 0; i < 5; i++) await ingest(s, `o/r${i}`, skill(i), { i });
    // DATABASE.md SS46: the index is built after canonical, not as a side effect of it.
    assert.equal(await s.searchIndexCount(), 0, 'nothing is indexed by the canonical write');
    await rebuildSearchIndex({ store: s, now: NOW });
    const r = await s.search({ q: 's-3', limit: 10 });
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].declared_name, 's-3');
    s.close();
  });

  test(`TC-203 [${name}] REQ-084 job history behaves identically`, async () => {
    const s = await make();
    await s.recordJob({ jobId: 'j1', skillRef: 'ref', sourceId: 'gitskills', stage: 'PARSED',
                  attempt: 1, status: 'running', startedAt: '2026-08-27T10:00:00Z' });
    await s.recordJob({ jobId: 'j1', skillRef: 'ref', sourceId: 'gitskills', stage: 'PARSED',
                  attempt: 1, status: 'succeeded', startedAt: '2026-08-27T99:99:99Z',
                  completedAt: '2026-08-27T10:05:00Z' });
    const j = await s.getJob('j1');
    assert.equal(j.status, 'succeeded');
    assert.equal(j.started_at, '2026-08-27T10:00:00Z', 'DEF-001: completing never moves the start time');
    assert.equal((await s.listJobs({ skillRef: 'ref' })).length, 1);
    s.close();
  });

  test(`TC-204 [${name}] REQ-063 removal and tombstoning behave identically`, async () => {
    const s = await make();
    const r = await ingest(s, 'o/r0', skill(0), { i: 0 });
    const svc = new RemovalService({ store: s, clock });
    await svc.submit({ requestId: 'rq1', canonicalId: r.canonicalId, repository: 'o/r0',
                 reason: 'no consent', requestedBy: 'author' });
    const res = await svc.action({ requestId: 'rq1', actor: 'op' });
    assert.equal(res.tombstoned, true);
    assert.equal(await s.tombstoneCount(), 1);
    assert.equal(await s.tombstonedCount(), 1);
    assert.ok(await s.getCanonical(r.canonicalId), 'the record is retained, not deleted');
    assert.equal((await svc.rebuildReport()).servable, 0);
    s.close();
  });

  test(`TC-205 [${name}] REQ-095 re-analysis targeting behaves identically`, async () => {
    const s = await make();
    const a = await ingest(s, 'o/r0', skill(0), { i: 0 });
    const b = await ingest(s, 'o/r1', skill(1), { i: 1 });
    const svc = new ReanalysisService({ store: s, clock });
    await svc.stamp(a.canonicalId, { scanner: '1.0.0' });
    const plan = await svc.plan({ analyser: 'scanner', version: '1.0.0' });
    assert.equal(plan.count, 1, 'only the unstamped record is affected');
    assert.equal(plan.affected[0].id, b.canonicalId);
    s.close();
  });

  test(`TC-206 [${name}] NFR-001 the digest is stable across identical input`, async () => {
    const build = async () => { const s = await make();
      for (let i = 0; i < 10; i++) await ingest(s, `o/r${i}`, skill(i), { i });
      const d = await s.digest(); s.close(); return d; };
    const a = await build(), b = await build();
    assert.equal(a.records, 10);
    assert.equal(a.digest, b.digest);
  });
}

test('TC-207 DEC-027 every adapter produces the SAME canonical digest for the same input', async () => {
  const digests = [];
  for (const [, make] of ADAPTERS) {
    const s = await make();
    for (let i = 0; i < 20; i++) await ingest(s, `o/r${i}`, skill(i), { i });
    digests.push(await s.digest());
    s.close();
  }
  for (let i = 1; i < digests.length; i++) {
    assert.equal(digests[i].records, digests[0].records, `${ADAPTERS[i][0]} record count`);
    assert.equal(digests[i].digest, digests[0].digest,
      `${ADAPTERS[i][0]} must agree byte for byte - the port carries no engine semantics`);
  }
  assert.ok(digests.length >= 3, 'at least one adapter must be genuinely asynchronous (DEF-009)');
});

test('TC-330 DEF-009 the contract suite contains an adapter that synchronous code cannot satisfy', async () => {
  // The regression guard for DEF-009 itself. If this ever fails, the suite has drifted
  // back to proving only that synchronous stores agree with each other.
  const s = new DeferredMemoryCanonicalStore();
  const pending = s.migrate({ now: NOW });
  assert.ok(pending instanceof Promise, 'migrate must not return a value synchronously');
  await pending;

  for (const method of ['schemaVersion', 'counts', 'cursorScan']) {
    const p = s[method]();
    assert.ok(p instanceof Promise, `${method}() must return a Promise, never a bare value`);
    await p;
  }

  // The shape a forgotten `await` actually produces: a Promise where a row was expected.
  const notARow = s.getCanonical('cs_nothing');
  assert.equal(typeof notARow.then, 'function',
    'a caller that forgets to await gets a Promise, which is what makes the omission visible');
  assert.equal(await notARow, null);
  s.close();
});
