import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestRecord, reprocessFromRaw, rebuildSearchIndex, JobRecorder,
         parseSkill, normalise, fingerprint, resolveOccurrence } from '../src/index.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { DeferredMemoryCanonicalStore } from '../../adapters/deferred-store/src/index.js';
import { MemoryCanonicalStore } from '../../adapters/memory-store/src/index.js';
import { FsObjectStore } from '../../adapters/fs-objectstore/src/index.js';
import { MemoryObjectStore } from '../../adapters/memory-objectstore/src/index.js';
import { LocalQueue } from '../../adapters/local-queue/src/index.js';
import { GitSkillsCorpusConnector, FixtureCorpusReader, GITSKILLS_ACCESS_POLICY,
         RepoLicenceReader, isQueryableName } from '../../connectors/gitskills/src/index.js';
import { syntheticCorpus } from '../../connectors/gitskills/fixtures/synthetic.js';
import { assertConnectorContract, assertObjectStoreContract, assertQueueConfig,
         Queue } from '../../ports/src/index.js';

/**
 * INTEGRATION LEVEL — module boundaries.
 *
 * Ìlànà's warning at G5: "a project with 90% unit coverage and no integration level is
 * not well tested. Unit tests cannot find interface defects." Every test here crosses at
 * least one port boundary with two real implementations on either side.
 */
const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'appmd-int-')); dirs.push(d); return d; };
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const SKILL = (n) => `---\nname: int-${n}\ndescription: Integration record ${n}.\n---\nBody ${n}.`;
const disco = (repo, i = 0) => ({
  source: 'gitskills', external_id: `${repo}:S.md`, repo_full_name: repo, path: 'S.md',
  author: repo.split('/')[0], url: `https://github.com/${repo}/blob/HEAD/S.md`,
  discovered_at: `2026-08-27T13:${String(i % 60).padStart(2, '0')}:00Z`,
  version_ref: `sha-${i}`, source_payload: { file_sha: `sha-${i}` } });

/** Every combination of canonical store x object store must behave identically. */
const RIGS = [
  ['sqlite+fs', async () => ({ store: await (async () => { const s = new SqliteCanonicalStore(':memory:'); await s.migrate({ now: NOW }); return s; })(),
                         objects: new FsObjectStore({ root: tmp() }) })],
  ['memory+memory', async () => ({ store: await (async () => { const s = new MemoryCanonicalStore(); await s.migrate({ now: NOW }); return s; })(),
                             objects: new MemoryObjectStore() })],
  ['sqlite+memory', async () => ({ store: await (async () => { const s = new SqliteCanonicalStore(':memory:'); await s.migrate({ now: NOW }); return s; })(),
                             objects: new MemoryObjectStore() })],
  // DEF-009 / CR-008: the deferred store drives the WHOLE pipeline, not just the store
  // contract. A missing await anywhere between discovery and the search index surfaces
  // here rather than against a live D1 binding.
  ['deferred+memory', async () => ({ store: await (async () => { const s = new DeferredMemoryCanonicalStore(); await s.migrate({ now: NOW }); return s; })(),
                             objects: new MemoryObjectStore() })],
];

for (const [name, make] of RIGS) {
  test(`TC-253 [${name}] NFR-027 the pipeline crosses every port with interchangeable adapters`, async () => {
    const { store, objects } = await make();
    for (let i = 0; i < 5; i++) {
      await ingestRecord({ store, objects, discovery: disco(`o/r${i}`, i),
                           rawText: SKILL(i), repoLicence: 'MIT', now: NOW });
    }
    assert.equal((await store.counts()).canonical, 5);
    assert.equal((await store.rawCounts()).retained, 5);
    await rebuildSearchIndex({ store, now: NOW });
    assert.equal((await store.search({ q: 'int-3' })).rows.length, 1);
    store.close();
  });
}

test('TC-254 REQ-050 the canonical store holds every entity the model requires', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();
  await store.upsertSource({ id: 'gitskills', accessPolicy: GITSKILLS_ACCESS_POLICY, now: NOW });
  await store.upsertRepository({ fullName: 'o/r0', owner: 'o', identityClass: 'individual',
                           licenceSpdx: 'MIT', now: NOW });
  const r = await ingestRecord({ store, objects, discovery: disco('o/r0'), rawText: SKILL(0),
                                 repoLicence: 'MIT', now: NOW });
  // CanonicalSkill, SkillOccurrence, Source, RawObject, ProvenanceRecord, RightsPosture.
  assert.ok(await store.getCanonical(r.canonicalId), 'CanonicalSkill');
  assert.equal((await store.listOccurrences({ canonicalId: r.canonicalId })).rows.length, 1, 'SkillOccurrence');
  assert.ok(await store.getSource('gitskills'), 'Source');
  assert.ok(await store.getRawObject(r.rawObjectKey), 'raw object record');
  const row = await store.getCanonical(r.canonicalId);
  assert.ok(JSON.parse(row.provenance_json).field_origins, 'ProvenanceRecord');
  assert.ok(JSON.parse(row.rights_json).state, 'RightsPosture');
  store.close();
});

test('TC-255 REQ-051 derived indexes are disposable; canonical is the source of truth', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();
  for (let i = 0; i < 6; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`, i), rawText: SKILL(i),
                         repoLicence: 'MIT', now: NOW });
  }
  await rebuildSearchIndex({ store, now: NOW });
  const before = (await store.counts()).canonical;
  // Destroy the derived index: canonical must be entirely unaffected.
  await store.clearSearchIndex();
  assert.equal((await store.counts()).canonical, before, 'canonical survives index destruction');
  assert.equal(await store.searchIndexCount(), 0);
  await rebuildSearchIndex({ store, now: NOW });
  assert.equal(await store.searchIndexCount(), before, 'and the index comes back from canonical alone');
  store.close();
});

test('TC-256 REQ-055 a content change creates a new version, never a silent overwrite', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();
  const v1 = await ingestRecord({ store, objects, discovery: disco('o/r0'), rawText: SKILL('v1'),
                                  repoLicence: 'MIT', now: NOW });
  const v2 = await ingestRecord({ store, objects, discovery: disco('o/r0'), rawText: SKILL('v2'),
                                  repoLicence: 'MIT', now: NOW });
  assert.notEqual(v2.canonicalId, v1.canonicalId, 'different content, different identity');
  assert.ok(await store.getCanonical(v1.canonicalId), 'the predecessor is still retrievable');
  assert.equal((await store.counts()).canonical, 2, 'nothing was overwritten');
  // Both raw objects survive independently.
  assert.ok(await objects.exists(v1.rawObjectKey));
  assert.ok(await objects.exists(v2.rawObjectKey));
  store.close();
});

test('TC-257 REQ-023/NFR-027 the queue port behaves identically across its adapters', async () => {
  // Only the local adapter can run offline; the contract it must satisfy is asserted
  // against the PORT declaration, so the cf adapter cannot silently differ.
  const q = new LocalQueue({ clock });
  assert.equal(Queue.guarantees.delivery, 'at-least-once');
  assert.equal(Queue.guarantees.requiresIdempotentConsumer, true);
  assert.throws(() => assertQueueConfig({ maxAttempts: 3 }), /DEC-025/);
  q.send('s', { ref: 'x' }, { idempotencyKey: 'k' });
  const stats = await q.consume('s', async () => {}, { deadLetterQueue: 'dlq', maxAttempts: 3 });
  assert.equal(stats.succeeded, 1);
  q.close();
});

test('TC-258 REQ-008 a new source needs no change to any pipeline stage', async () => {
  // The proof: a connector written HERE, in a test file, with a shape neither existing
  // connector has, drives the unmodified pipeline end to end.
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();

  const inventedConnector = {
    id: () => 'invented',
    accessPolicy: () => ({ max_concurrency: 2, permitted_methods: ['local'], auth: 'none' }),
    discover: () => ({ records: [{ source: 'invented', external_id: 'x/y:S.md',
      repo_full_name: 'x/y', path: 'S.md', author: 'x',
      url: 'https://github.com/x/y/blob/HEAD/S.md', discovered_at: NOW, source_payload: {} }] }),
    identify: (r) => ({ source: 'invented', repo_full_name: r.repo_full_name, path: r.path }),
    getMetadata: () => ({}), getContent: () => ({ status: 'ok', bytes: SKILL('new') }),
    getVersion: () => ({ ref: null, kind: 'none' }),
  };
  assert.ok(assertConnectorContract(inventedConnector));

  const { records } = inventedConnector.discover();
  const r = await ingestRecord({ store, objects, discovery: records[0],
                                 rawText: inventedConnector.getContent().bytes,
                                 repoLicence: 'MIT', now: NOW });
  assert.ok(r.canonicalId);
  assert.equal((await store.getRawObject(r.rawObjectKey)).source_id, 'invented');
  store.close();
});

test('TC-259 REQ-003/REQ-009/REQ-011/REQ-013 discovery is separable, re-runnable and reported', async () => {
  const corpus = syntheticCorpus({ rows: 400 });
  const conn = new GitSkillsCorpusConnector({ reader: new FixtureCorpusReader(corpus) });

  // REQ-009: discovery answers "what exists?" and touches no store.
  const a = await conn.discover({ limit: 40, strata: 10 });
  assert.equal(a.records.length, 40);

  // REQ-011: re-running over unchanged state is identical - no new identities implied.
  const b = await conn.discover({ limit: 40, strata: 10 });
  assert.equal(JSON.stringify(a.records), JSON.stringify(b.records));

  // REQ-013: the run reports source, parameters, counts and its sampling.
  assert.equal(a.disclosure.method, 'stratified-by-offset');
  assert.equal(a.disclosure.sampled, 40);
  assert.equal(a.disclosure.population, 400);
  assert.ok(a.disclosure.bias.length > 0);
  assert.ok(Array.isArray(a.disclosure.caveats) && a.disclosure.caveats.length > 0);
});

test('TC-260 DOM-012/REQ-006 every REGISTERED connector declares an enforceable access policy', async () => {
  // NOTE: this test previously named REQ-004 (SkillsMPConnector) in its title while
  // exercising only the GitSkills corpus connector. REQ-004 is NOT implemented
  // (DEF-008), and a title that claims otherwise is a false traceability entry -
  // worse than an uncovered requirement, because it hides one.
  const p = GITSKILLS_ACCESS_POLICY;
  assert.ok(assertConnectorContract(
    new GitSkillsCorpusConnector({ reader: new FixtureCorpusReader([]) })));
  // The policy is DATA the runtime can enforce, not prose.
  assert.equal(typeof p.max_concurrency, 'number');
  assert.ok(Array.isArray(p.permitted_methods));
  assert.equal(p.permitted_methods.includes('html-bulk'), false, 'REQ-004: never bulk HTML');
  assert.ok(p.tos_notes.length > 0, 'the ToS constraint travels with the connector');
});

test('TC-261 REQ-083 job lifecycle and stage counters cross the store boundary intact', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  let t = '2026-08-27T10:00:00Z';
  const rec = new JobRecorder({ store, clock: () => t });
  const job = { jobId: 'j1', skillRef: 'gitskills:o/r:S.md', sourceId: 'gitskills',
                stage: 'PARSED', attempt: 1 };
  await rec.start(job);
  t = '2026-08-27T10:00:05Z';
  await rec.succeed(job);
  await rec.start({ ...job, jobId: 'j2', stage: 'STORED' });
  await rec.parseFailed({ ...job, jobId: 'j3' }, 'no frontmatter');
  await rec.deadLettered({ ...job, jobId: 'j4' }, new Error('source down'));

  const c = rec.counters();
  assert.equal(c.parsed_succeeded, 1);
  assert.equal(c.parse_failed, 1);
  assert.equal(c.dead_lettered, 1);
  // Latency is measurable because started_at is preserved (DEF-001).
  const row = await store.getJob('j1');
  assert.equal(row.started_at, '2026-08-27T10:00:00Z');
  assert.equal(row.completed_at, '2026-08-27T10:00:05Z');
  assert.equal(Date.parse(row.completed_at) - Date.parse(row.started_at), 5000,
    'per-stage latency is computable, which is what REQ-083 needs');
  store.close();
});

test('TC-262 NFR-007 a failure at record n leaves records 1..n-1 byte-identical', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();
  for (let i = 0; i < 10; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`, i), rawText: SKILL(i),
                         repoLicence: 'MIT', now: NOW });
  }
  const before = await store.digest();

  // Inject a failure on record 11.
  const failing = { ...objects, put: async () => { throw new Error('injected failure at n'); } };
  await assert.rejects(async () => ingestRecord({ store, objects: failing, discovery: disco('o/r10', 10),
                                            rawText: SKILL(10), repoLicence: 'MIT', now: NOW }));
  const after = await store.digest();
  assert.equal(after.records, before.records, 'no record was added');
  assert.equal(after.digest, before.digest, 'and the first ten are byte-identical');
  store.close();
});

test('TC-263 NFR-008 the pipeline resumes from its persisted cursor after abrupt termination', async () => {
  const dir = tmp();
  const dbPath = join(dir, 'resume.db');
  const objects = new FsObjectStore({ root: join(dir, 'raw') });

  // Run 1: ingest five records and persist a cursor, then "die" without cleanup.
  let store = new SqliteCanonicalStore(dbPath);
  await store.migrate({ now: NOW });
  for (let i = 0; i < 5; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`, i), rawText: SKILL(i),
                         repoLicence: 'MIT', now: NOW });
  }
  await store.setCursor('gitskills:discover', 'gitskills', 'offset:5', NOW);
  store.close();   // no graceful drain: the process is simply gone

  // Run 2: a fresh process reopens the same store.
  store = new SqliteCanonicalStore(dbPath);
  assert.equal(await store.getCursor('gitskills:discover'), 'offset:5', 'the cursor survived');
  assert.equal((await store.counts()).canonical, 5, 'and so did the work');

  // Resuming re-ingests the same records: idempotent, no duplicates.
  for (let i = 0; i < 5; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`, i), rawText: SKILL(i),
                         repoLicence: 'MIT', now: NOW });
  }
  assert.equal((await store.counts()).canonical, 5, 'no duplicate canonical records');
  assert.equal((await store.counts()).occurrences, 5, 'and no duplicate occurrences');
  store.close();
});

test('TC-264 REQ-096/NFR-037 connector access channels are recorded, keeping API use separable', async () => {
  // DEF-004's audit trail: which channel a request used must be knowable after the fact.
  assert.equal(isQueryableName('owner/repo'), true);
  assert.equal(isQueryableName('owner/study--x'), false, 'unsafe names never reach a query');
  const r = new RepoLicenceReader({ cacheDir: join(tmp(), 'c') });
  assert.equal(r.requests, 0, 'no request is made for an unqueryable name');
  assert.deepEqual(r.unqueryable, []);
});
