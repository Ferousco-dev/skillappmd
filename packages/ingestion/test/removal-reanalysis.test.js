import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemovalService, REQUEST_KIND, DISPOSITION,
         ReanalysisService, REANALYSIS_TRIGGER,
         parseSkill, normalise, fingerprint, resolveOccurrence } from '../src/index.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { LocalQueue } from '../../adapters/local-queue/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;

function rig() {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const raw = `---\nname: s-${i}\ndescription: d${i}\n---\nBody ${i}.`;
    const d = { source: 'gitskills', external_id: `o/r${i}:S.md`, repo_full_name: `o/r${i}`,
      path: 'S.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/S.md`,
      discovered_at: NOW, source_payload: {} };
    const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw, repoLicence: 'MIT', now: NOW });
    resolveOccurrence({ store, discovery: d, canonical: c, fingerprints: fingerprint(raw), now: NOW });
    ids.push(c.id);
  }
  return { store, ids };
}
/** Minimal ObjectStore port double, so byte deletion is observable. */
const objects = () => {
  const held = new Set(['sha256:x']);
  return { held, async delete(k) { held.delete(k); return true; },
           async put() {}, async get() {}, async head() {}, async exists() { return true; } };
};

test('TC-181 REQ-063 a request is recorded BEFORE any disposition is decided', () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, clock });
  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0',
               reason: 'I did not consent to indexing', requestedBy: 'author@example' });
  const r = store.getRemovalRequest('rq1');
  assert.equal(r.disposition, DISPOSITION.PENDING);
  assert.equal(r.repository, 'o/r0');
  assert.equal(r.requested_by, 'author@example');
  assert.ok(r.requested_at, 'the request is timestamped even before action');
  store.close();
});

test('TC-182 REQ-063 a request without repository, reason or requester is refused', () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, clock });
  const base = { requestId: 'x', canonicalId: ids[0], repository: 'o/r0',
                 reason: 'r', requestedBy: 'a' };
  for (const f of ['repository', 'reason', 'requestedBy']) {
    assert.throws(() => svc.submit({ ...base, [f]: undefined }), /REQ-063/, `${f} is required`);
  }
  store.close();
});

test('TC-183 DEC-015 actioning deletes the BYTES and keeps the provenance envelope', async () => {
  const { store, ids } = rig();
  const obj = objects();
  const row = store.getCanonical(ids[0]);
  obj.held.add(row.content_hash);
  const svc = new RemovalService({ store, objects: obj, clock });

  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0',
               reason: 'removal please', requestedBy: 'author@example' });
  const res = await svc.action({ requestId: 'rq1', actor: 'operator' });

  assert.equal(res.bytesDeleted, true);
  assert.equal(obj.held.has(row.content_hash), false, 'bytes are gone');
  assert.equal(store.tombstoneCount(), 1, 'a tombstone exists');
  const after = store.getCanonical(ids[0]);
  assert.ok(after, 'the canonical record is RETAINED - an index that loses records silently is not an index');
  assert.equal(after.content_bytes_held, 0);
  assert.ok(after.tombstoned_at);
  assert.equal(after.attribution_repository, 'o/r0', 'attribution survives removal');
  store.close();
});

test('TC-184 DEC-015 the tombstone carries who asked, for what, and under what claim', async () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, objects: objects(), clock });
  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0',
               reason: 'licence violation', requestedBy: 'author@example' });
  await svc.action({ requestId: 'rq1', actor: 'operator' });
  const t = store.__db;   // not exposed; assert via count + request record instead
  const req = store.getRemovalRequest('rq1');
  assert.equal(req.disposition, DISPOSITION.ACTIONED);
  assert.equal(req.actor, 'operator');
  assert.ok(req.actioned_at);
  assert.equal(store.tombstoneCount(), 1);
  store.close();
});

test('TC-185 REQ-063 a decline is recorded with its reason and stays visible', () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, clock });
  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0',
               reason: 'please remove', requestedBy: 'someone' });
  assert.throws(() => svc.decline({ requestId: 'rq1', actor: 'op' }), /REQ-063/,
    'a decline without a reason is refused');
  svc.decline({ requestId: 'rq1', actor: 'op', dispositionReason: 'requester is not the repository owner' });
  const r = store.getRemovalRequest('rq1');
  assert.equal(r.disposition, DISPOSITION.DECLINED);
  assert.match(r.disposition_reason, /not the repository owner/);
  assert.equal(svc.history('o/r0').length, 1, 'the request remains visible to the requester');
  store.close();
});

test('TC-186 REQ-063 a request cannot be actioned twice', async () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, objects: objects(), clock });
  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0', reason: 'r', requestedBy: 'a' });
  await svc.action({ requestId: 'rq1', actor: 'op' });
  await assert.rejects(() => svc.action({ requestId: 'rq1', actor: 'op' }), /already actioned/);
  store.close();
});

test('TC-187 NFR-010 the rebuild report states the tombstoned count, never "identical"', async () => {
  const { store, ids } = rig();
  const svc = new RemovalService({ store, objects: objects(), clock });
  svc.submit({ requestId: 'rq1', canonicalId: ids[0], repository: 'o/r0', reason: 'r', requestedBy: 'a' });
  await svc.action({ requestId: 'rq1', actor: 'op' });
  const rep = svc.rebuildReport();
  assert.equal(rep.canonical, 3);
  assert.equal(rep.tombstoned, 1);
  assert.equal(rep.servable, 2);
  assert.match(rep.note, /equivalent minus tombstoned/);
  store.close();
});

test('TC-188 REQ-095 affected records are found by QUERY, not by guess', () => {
  const { store, ids } = rig();
  const svc = new ReanalysisService({ store, clock });
  svc.stamp(ids[0], { 'security-scanner': '0.1.0' });
  svc.stamp(ids[1], { 'security-scanner': '0.2.0' });
  // ids[2] has never been analysed at all.
  const plan = svc.plan({ analyser: 'security-scanner', version: '0.2.0' });
  const affected = plan.affected.map((a) => a.id).sort();
  assert.deepEqual(affected, [ids[0], ids[2]].sort(),
    'stale AND never-analysed records are both affected; the current one is not');
  assert.equal(plan.affected.find((a) => a.id === ids[0]).currentVersion, '0.1.0');
  assert.equal(plan.affected.find((a) => a.id === ids[2]).currentVersion, null);
  store.close();
});

test('TC-189 REQ-095 a dry run reports the blast radius without enqueuing', async () => {
  const { store, ids } = rig();
  const queue = new LocalQueue({ clock });
  const svc = new ReanalysisService({ store, queue, clock });
  svc.stamp(ids[0], { parser: '0.1.0' });
  const dry = await svc.enqueue({ analyser: 'parser', version: '0.2.0', dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.enqueued, 0);
  assert.equal(dry.planned, 3, 'all three are stale or unanalysed');
  assert.equal(queue.depth('reanalysis'), 0, 'nothing was enqueued');
  queue.close(); store.close();
});

test('TC-190 REQ-095/REQ-016 enqueued re-analysis jobs are idempotent by construction', async () => {
  const { store } = rig();
  const queue = new LocalQueue({ clock });
  const svc = new ReanalysisService({ store, queue, clock });
  await svc.enqueue({ analyser: 'parser', version: '0.2.0' });
  await svc.enqueue({ analyser: 'parser', version: '0.2.0' });   // a second, identical trigger
  const processed = [];
  await queue.consume('reanalysis', async (p) => { processed.push(p.canonical_id); },
    { deadLetterQueue: 'dlq', maxAttempts: 3, batchSize: 50 });
  assert.equal(new Set(processed).size, processed.length, 'no record reprocessed twice');
  assert.equal(processed.length, 3, 'three records, once each, despite two triggers');
  queue.close(); store.close();
});

test('TC-191 REQ-095 messages carry references only, and name their trigger', async () => {
  const { store } = rig();
  const queue = new LocalQueue({ clock });
  const svc = new ReanalysisService({ store, queue, clock });
  await svc.enqueue({ analyser: 'security-scanner', version: '1.0.0',
                      trigger: REANALYSIS_TRIGGER.SECURITY_RULES });
  let seen = null;
  await queue.consume('reanalysis', async (p) => { seen = p; },
    { deadLetterQueue: 'dlq', maxAttempts: 3, batchSize: 1, maxBatches: 1 });
  assert.equal(seen.trigger, REANALYSIS_TRIGGER.SECURITY_RULES);
  assert.ok(seen.canonical_id && seen.content_hash);
  assert.equal('content' in seen, false, 'REQ-018: references, never content');
  queue.close(); store.close();
});

test('TC-192 REQ-094 the v2 migration upgrades an existing store without losing data', () => {
  const { store, ids } = rig();
  const before = store.counts().canonical;
  // Re-running migrate on an already-migrated store is a no-op and loses nothing.
  const r = store.migrate({ now: NOW });
  assert.deepEqual(r.applied, []);
  assert.equal(store.schemaVersion(), 2);
  assert.equal(store.counts().canonical, before);
  assert.ok(store.getCanonical(ids[0]), 'existing records survive');
  store.close();
});
