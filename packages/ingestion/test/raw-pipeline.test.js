import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestRecord, reprocessFromRaw, storeRaw, readRaw, applyRetention,
         deleteRawFor, rebuildSearchIndex, expiryFor, RawUnavailableError,
         RAW_PURPOSE, RemovalService, ReanalysisService } from '../src/index.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { MemoryCanonicalStore } from '../../adapters/memory-store/src/index.js';
import { FsObjectStore, keyForBytes } from '../../adapters/fs-objectstore/src/index.js';
import { MemoryObjectStore } from '../../adapters/memory-objectstore/src/index.js';
import { contentHash, RETENTION_POLICY } from '../../skill-core/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'appmd-raw-')); dirs.push(d); return d; };
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const SKILL = '---\nname: raw-demo\ndescription: A skill whose bytes we keep.\n---\nBody bytes here.';
const disco = (repo = 'owner/repo', path = 'skills/x/SKILL.md') => ({
  source: 'gitskills', external_id: `${repo}:${path}`, repo_full_name: repo, path,
  author: repo.split('/')[0], url: `https://github.com/${repo}/blob/HEAD/${path}`,
  discovered_at: '2026-08-20T00:00:00Z', version_ref: 'blobsha123',
  source_payload: { file_sha: 'blobsha123' } });

function rig({ root = null } = {}) {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  const objects = new FsObjectStore({ root: root ?? tmp() });
  return { store, objects };
}

// ---------------------------------------------------------------- RAW ingestion

test('TC-219 REQ-029 ingestion writes RAW BYTES to disk before parsing', async () => {
  const root = tmp();
  const { store, objects } = rig({ root });
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  const hex = r.rawObjectKey.slice('sha256:'.length);
  const onDisk = join(root, 'sha256', hex.slice(0, 2), hex.slice(2, 4), `${hex}.raw`);
  assert.ok(existsSync(onDisk), 'the bytes are a real file on a real disk');
  assert.equal(readFileSync(onDisk, 'utf8'), SKILL, 'byte-for-byte identical to the source');
  store.close();
});

test('TC-220 REQ-029 raw_object_key is persisted on the occurrence', async () => {
  const { store, objects } = rig();
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  const occ = store.listOccurrences({ canonicalId: r.canonicalId }).rows[0];
  assert.equal(occ.raw_object_key, r.rawObjectKey);
  assert.equal(occ.raw_object_key, contentHash(SKILL), 'and it IS the content hash');
  store.close();
});

test('TC-221 REQ-030 the raw record retains source, URL, timestamp, version and hash', async () => {
  const { store, objects } = rig();
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  const row = store.getRawObject(r.rawObjectKey);
  assert.equal(row.source_id, 'gitskills');
  assert.equal(row.source_url, 'https://github.com/owner/repo/blob/HEAD/skills/x/SKILL.md');
  assert.equal(row.retrieved_at, '2026-08-20T00:00:00Z', 'the RETRIEVAL time, not now');
  assert.equal(row.source_version_ref, 'blobsha123');
  assert.equal(row.content_hash, contentHash(SKILL));
  assert.equal(row.size_bytes, Buffer.byteLength(SKILL, 'utf8'));

  // REQ-030: the object is SELF-DESCRIBING, so raw survives loss of the database.
  const meta = (await objects.head(r.rawObjectKey));
  assert.equal(meta.source, 'gitskills');
  assert.equal(meta.repo_full_name, 'owner/repo');
  assert.equal(meta.source_version_ref, 'blobsha123');
  store.close();
});

test('TC-222 REQ-031 ingestion REFUSES to proceed when raw persistence fails', async () => {
  const { store } = rig();
  const broken = { async put() { throw new Error('disk full'); }, async get() {}, async head() {},
                   async exists() { return false; }, async delete() { return false; } };
  await assert.rejects(() => ingestRecord({ store, objects: broken, discovery: disco(),
                                            rawText: SKILL, repoLicence: 'MIT', now: NOW }), /disk full/);
  assert.equal(store.counts().canonical, 0,
    'no canonical record claims a raw reference the system does not hold');
  store.close();
});

test('TC-223 REQ-029 ingestion requires an ObjectStore at all', async () => {
  const { store } = rig();
  await assert.rejects(() => ingestRecord({ store, objects: null, discovery: disco(),
                                            rawText: SKILL, now: NOW }), /REQ-029 violated/);
  store.close();
});

test('TC-224 REQ-031 re-ingesting identical content does not mutate raw', async () => {
  const { store, objects } = rig();
  const a = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL, repoLicence: 'MIT', now: NOW });
  const before = (await objects.get(a.rawObjectKey)).bytes.toString();
  await ingestRecord({ store, objects, discovery: disco('other/repo'), rawText: SKILL, repoLicence: 'MIT', now: NOW });
  assert.equal((await objects.get(a.rawObjectKey)).bytes.toString(), before, 'raw is untouched');
  assert.equal(store.counts().canonical, 1);
  assert.equal(store.counts().occurrences, 2, 'evidence still accumulates');
  store.close();
});

// ------------------------------------------------- REQ-032: the centrepiece

test('TC-225 REQ-032 reprocess from RAW with the source PROVABLY unavailable', async () => {
  const root = tmp();
  const { store, objects } = rig({ root });

  // 1-2. Ingest and store the real bytes.
  const first = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                     repoLicence: 'MIT', now: NOW });
  assert.equal(store.counts().canonical, 1);

  // 3-4. Make the source unavailable. Every connector method throws, and global fetch
  //      is replaced so ANY network call - from anywhere - fails the test loudly.
  let sourceTouched = 0;
  const deadConnector = new Proxy({}, { get: () => () => {
    sourceTouched++; throw new Error('SOURCE UNAVAILABLE: the connector must not be called (REQ-032)');
  } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => {
    sourceTouched++;
    throw new Error(`NETWORK CONTACT ATTEMPTED during reprocessing: ${String(a[0]).slice(0, 80)}`);
  };

  try {
    // Prove the connector really is dead.
    assert.throws(() => deadConnector.discover(), /SOURCE UNAVAILABLE/);
    sourceTouched = 0;

    // 5-7. Reprocess from RAW. Not mocked: this reads the real file written in step 2.
    const again = await reprocessFromRaw({ store, objects, contentHash: first.rawObjectKey,
                                           repoLicence: 'MIT', now: NOW });

    // 8. A derived result was produced.
    assert.equal(again.fromRaw, true);
    assert.equal(again.canonicalId, first.canonicalId, 'resolves to the same identity');
    assert.equal(again.parsed.ok, true);
    assert.equal(again.parsed.frontmatter.name, 'raw-demo', 'parsed from the stored bytes');
    assert.equal(again.canonical.attribution.repository, 'owner/repo',
      'attribution reconstructed from the raw object\'s own metadata');

    // THE EVIDENCE for REQ-032.
    assert.equal(sourceTouched, 0, 'ZERO source contacts and ZERO network calls');
  } finally { globalThis.fetch = realFetch; }
  store.close();
});

test('TC-226 REQ-032 reprocessing reads the REAL stored bytes, not a mock', async () => {
  const root = tmp();
  const { store, objects } = rig({ root });
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  // Deleting the file from underneath must break reprocessing. If it still succeeded,
  // the test would be reading something other than the stored object.
  const hex = r.rawObjectKey.slice('sha256:'.length);
  rmSync(join(root, 'sha256', hex.slice(0, 2), hex.slice(2, 4), `${hex}.raw`), { force: true });
  await assert.rejects(() => reprocessFromRaw({ store, objects, contentHash: r.rawObjectKey, now: NOW }),
    RawUnavailableError, 'proof that the earlier pass genuinely read from disk');
  store.close();
});

test('TC-227 REQ-032/DEC-019 a deleted raw object never silently re-fetches the source', async () => {
  const { store, objects } = rig();
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  await deleteRawFor({ objects, store, contentHash: r.rawObjectKey, now: NOW, reason: 'test' });
  const err = await reprocessFromRaw({ store, objects, contentHash: r.rawObjectKey, now: NOW })
    .then(() => null, (e) => e);
  assert.ok(err instanceof RawUnavailableError);
  assert.match(err.message, /source is NOT re-fetched implicitly/);
  store.close();
});

// ---------------------------------------------------------------- retention

test('TC-228 REQ-034/DEC-019 retention policy follows the rights posture', async () => {
  const { store, objects } = rig();
  const unknown = await ingestRecord({ store, objects, discovery: disco('a/one'),
    rawText: SKILL, repoLicence: null, now: NOW });
  const copyleft = await ingestRecord({ store, objects, discovery: disco('b/two'),
    rawText: SKILL.replace('raw-demo', 'raw-two'), repoLicence: 'GPL-3.0', now: NOW });
  const permissive = await ingestRecord({ store, objects, discovery: disco('c/three'),
    rawText: SKILL.replace('raw-demo', 'raw-three'), repoLicence: 'MIT', now: NOW });

  assert.equal(store.getRawObject(unknown.rawObjectKey).retention_policy, RETENTION_POLICY.PROCESS_THEN_DELETE);
  assert.equal(store.getRawObject(copyleft.rawObjectKey).retention_policy, RETENTION_POLICY.SHORT);
  assert.equal(store.getRawObject(permissive.rawObjectKey).retention_policy, RETENTION_POLICY.STANDARD);
  store.close();
});

test('TC-229 REQ-034 expiry deletes REAL bytes and the state becomes observable', async () => {
  const { store, objects } = rig();
  const unknown = await ingestRecord({ store, objects, discovery: disco('a/one'),
    rawText: SKILL, repoLicence: null, now: NOW });                    // process-then-delete
  const keep = await ingestRecord({ store, objects, discovery: disco('c/three'),
    rawText: SKILL.replace('raw-demo', 'keeper'), repoLicence: 'MIT', now: NOW });  // 90 days

  assert.equal(store.rawCounts().retained, 2);
  assert.equal(await objects.exists(unknown.rawObjectKey), true, 'bytes exist before expiry');

  const res = await applyRetention({ objects, store, now: NOW });
  assert.equal(res.considered, 1, 'only the expired one is considered');
  assert.equal(res.deleted, 1);
  assert.equal(await objects.exists(unknown.rawObjectKey), false, 'BYTES ARE GONE');
  assert.equal(await objects.exists(keep.rawObjectKey), true, 'the 90-day object is untouched');

  const row = store.getRawObject(unknown.rawObjectKey);
  assert.equal(row.state, 'deleted');
  assert.ok(row.deleted_at);
  assert.equal(row.source_url, 'https://github.com/a/one/blob/HEAD/skills/x/SKILL.md',
    'DEC-015: the envelope outlives the bytes');
  assert.deepEqual(store.rawCounts(), { retained: 1, expired: 0, deleted: 1, total: 2 });
  store.close();
});

test('TC-230 REQ-034 expiry dates derive from the policy, not from wishful thinking', () => {
  // toISOString() normalises to millisecond precision; the assertion was originally
  // written against the un-normalised input and was wrong about the CODE, not the code
  // being wrong about the policy.
  assert.equal(expiryFor(RETENTION_POLICY.PROCESS_THEN_DELETE, NOW), '2026-08-27T13:45:00.000Z',
    'process-then-delete expires immediately - same instant, not later');
  assert.equal(expiryFor(RETENTION_POLICY.SHORT, NOW), '2026-09-03T13:45:00.000Z', '+7 days');
  assert.equal(expiryFor(RETENTION_POLICY.STANDARD, NOW), '2026-11-25T13:45:00.000Z', '+90 days');
  // And the ordering that DEC-019 actually cares about:
  const p = expiryFor(RETENTION_POLICY.PROCESS_THEN_DELETE, NOW);
  const sh = expiryFor(RETENTION_POLICY.SHORT, NOW);
  const st = expiryFor(RETENTION_POLICY.STANDARD, NOW);
  assert.ok(p < sh && sh < st, 'unknown rights get the SHORTEST retention (DEC-019)');
});

// ---------------------------------------------------------------- removal

test('TC-231 REQ-063 author removal now deletes REAL raw bytes', async () => {
  const { store, objects } = rig();
  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  assert.equal(await objects.exists(r.rawObjectKey), true);

  const svc = new RemovalService({ store, objects, clock });
  svc.submit({ requestId: 'rq1', canonicalId: r.canonicalId, repository: 'owner/repo',
               reason: 'I did not consent', requestedBy: 'author@example' });
  const res = await svc.action({ requestId: 'rq1', actor: 'operator' });

  assert.equal(res.bytesDeleted, true, 'increment 10 reported false here; now there are bytes');
  assert.equal(await objects.exists(r.rawObjectKey), false, 'BYTES ARE GONE');
  assert.equal(store.tombstoneCount(), 1, 'the envelope survives');
  const canonical = store.getCanonical(r.canonicalId);
  assert.ok(canonical, 'the canonical record is retained');
  assert.equal(canonical.attribution_repository, 'owner/repo', 'attribution survives removal');
  store.close();
});

test('TC-232 REQ-063/REQ-052 removed content disappears from the rebuilt index and the API', async () => {
  const { store, objects } = rig();
  const a = await ingestRecord({ store, objects, discovery: disco('a/one'),
    rawText: SKILL, repoLicence: 'MIT', now: NOW });
  await ingestRecord({ store, objects, discovery: disco('b/two'),
    rawText: SKILL.replace('raw-demo', 'survivor'), repoLicence: 'MIT', now: NOW });

  rebuildSearchIndex({ store, now: NOW });
  assert.equal(store.search({ q: 'raw-demo' }).rows.length, 1, 'present before removal');

  const svc = new RemovalService({ store, objects, clock });
  svc.submit({ requestId: 'rq1', canonicalId: a.canonicalId, repository: 'a/one',
               reason: 'removal', requestedBy: 'author' });
  await svc.action({ requestId: 'rq1', actor: 'op' });

  const rb = rebuildSearchIndex({ store, now: NOW });
  assert.equal(rb.excludedTombstoned, 1);
  assert.equal(rb.indexed, 1);
  assert.equal(store.search({ q: 'raw-demo' }).rows.length, 0, 'gone from the index');
  assert.equal(store.search({ q: 'survivor' }).rows.length, 1, 'the other record is unaffected');
  store.close();
});

// ---------------------------------------------------------------- rebuild

test('TC-233 REQ-052 the index is genuinely DESTROYED and REBUILT from canonical', async () => {
  const { store, objects } = rig();
  for (let i = 0; i < 12; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`),
      rawText: SKILL.replace('raw-demo', `skill-${i}`), repoLicence: 'MIT', now: NOW });
  }
  const first = rebuildSearchIndex({ store, now: NOW });
  assert.equal(first.indexed, 12);
  assert.equal(store.searchIndexCount(), 12);

  // Destroy it, as NFR-010 requires the test to do.
  assert.equal(store.clearSearchIndex(), 12);
  assert.equal(store.searchIndexCount(), 0);
  assert.equal(store.search({ q: 'skill-5' }).rows.length, 0, 'search is genuinely broken now');

  const second = rebuildSearchIndex({ store, now: NOW });
  assert.equal(second.indexed, 12, 'rebuilt from canonical alone');
  assert.equal(second.sourceContact, false);
  assert.equal(store.search({ q: 'skill-5' }).rows.length, 1, 'search works again');
  assert.equal(store.counts().canonical, 12, 'canonical was never touched');
  store.close();
});

test('TC-234 NFR-010 the rebuild report never claims equivalence when records were excluded', async () => {
  const { store, objects } = rig();
  const a = await ingestRecord({ store, objects, discovery: disco('a/one'), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  await ingestRecord({ store, objects, discovery: disco('b/two'),
    rawText: SKILL.replace('raw-demo', 'other'), repoLicence: 'MIT', now: NOW });

  const clean = rebuildSearchIndex({ store, now: NOW });
  assert.match(clean.equivalence, /^equivalent to canonical$/);

  store.markTombstoned({ canonicalId: a.canonicalId, now: NOW });
  const after = rebuildSearchIndex({ store, now: NOW });
  assert.equal(after.excludedTombstoned, 1);
  assert.match(after.equivalence, /MINUS 1 tombstoned/);
  assert.notEqual(after.equivalence, 'equivalent to canonical');
  store.close();
});

test('TC-235 REQ-052 rebuilding twice is deterministic', async () => {
  const { store, objects } = rig();
  for (let i = 0; i < 8; i++) {
    await ingestRecord({ store, objects, discovery: disco(`o/r${i}`),
      rawText: SKILL.replace('raw-demo', `det-${i}`), repoLicence: 'MIT', now: NOW });
  }
  const a = rebuildSearchIndex({ store, now: NOW });
  const b = rebuildSearchIndex({ store, now: NOW });
  assert.equal(a.indexed, b.indexed);
  assert.equal(a.excludedTombstoned, b.excludedTombstoned);
  assert.equal(store.search({ q: 'det-3' }).rows.length, 1);
  store.close();
});

// ---------------------------------------------------------------- portability

test('TC-236 DEC-027 the RAW pipeline runs unchanged on a no-SQL store and a no-filesystem object store', async () => {
  // Neither adapter here touches SQL or a filesystem. The pipeline code is identical.
  const store = new MemoryCanonicalStore();
  store.migrate({ now: NOW });
  const objects = new MemoryObjectStore();

  const r = await ingestRecord({ store, objects, discovery: disco(), rawText: SKILL,
                                 repoLicence: 'MIT', now: NOW });
  assert.equal(r.rawObjectKey, contentHash(SKILL));
  assert.equal(store.getRawObject(r.rawObjectKey).source_id, 'gitskills');

  const again = await reprocessFromRaw({ store, objects, contentHash: r.rawObjectKey, now: NOW });
  assert.equal(again.canonicalId, r.canonicalId);

  const rb = rebuildSearchIndex({ store, now: NOW });
  assert.equal(rb.indexed, 1);
  assert.equal(store.search({ q: 'raw-demo' }).rows.length, 1);

  await applyRetention({ objects, store, now: '2027-01-01T00:00:00Z' });
  assert.equal(await objects.exists(r.rawObjectKey), false, 'retention deletes here too');
  store.close();
});

// ---------------------------------------------------------------- re-analysis

test('TC-237 REQ-095/REQ-032 re-analysis reprocesses from raw with no source', async () => {
  const { store, objects } = rig();
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await ingestRecord({ store, objects, discovery: disco(`o/r${i}`),
      rawText: SKILL.replace('raw-demo', `re-${i}`), repoLicence: 'MIT', now: NOW });
    ids.push(r);
  }
  const svc = new ReanalysisService({ store, clock });
  svc.stamp(ids[0].canonicalId, { parser: '0.1.0' });

  const plan = svc.plan({ analyser: 'parser', version: '0.2.0' });
  assert.equal(plan.count, 3, 'stale and never-analysed alike');

  // Now actually do the work the plan describes - from raw, with no connector in scope.
  let reprocessed = 0;
  for (const a of plan.affected) {
    const res = await reprocessFromRaw({ store, objects, contentHash: a.contentHash, now: NOW });
    assert.equal(res.fromRaw, true);
    reprocessed++;
  }
  assert.equal(reprocessed, 3, 'BRIEF SS10 holds: reprocess without crawling the source again');
  store.close();
});
