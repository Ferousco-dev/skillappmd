import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobRecorder, JOB_STATUS, JOB_FIELDS } from '../src/index.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;
async function rig() {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  return { store, rec: new JobRecorder({ store, clock }) };
}
const job = (over = {}) => ({ jobId: 'j1', skillRef: 'gitskills:o/r:SKILL.md',
  sourceId: 'gitskills', stage: 'PARSED', attempt: 1, ...over });

test('TC-085 REQ-017 every job carries the full field set', async () => {
  const { store, rec } = await rig();
  await rec.start(job()); await rec.succeed(job());
  const j = await store.getJob('j1');
  for (const f of ['job_id', 'skill_ref', 'source_id', 'stage', 'attempt', 'status', 'started_at']) {
    assert.ok(j[f] !== null && j[f] !== undefined, `job must carry ${f}`);
  }
  assert.equal(j.status, JOB_STATUS.SUCCEEDED);
  assert.equal(JOB_FIELDS.length, 9);
  store.close();
});

test('TC-086 REQ-084 job history is queryable by skill_ref across stages', async () => {
  const { store, rec } = await rig();
  for (const [i, stage] of ['FETCHED', 'PARSED', 'NORMALISED', 'STORED'].entries()) {
    await rec.start(job({ jobId: `j${i}`, stage })); await rec.succeed(job({ jobId: `j${i}`, stage }));
  }
  const h = await rec.history('gitskills:o/r:SKILL.md');
  assert.equal(h.length, 4);
  assert.deepEqual(h.map((x) => x.stage), ['FETCHED', 'PARSED', 'NORMALISED', 'STORED']);
  store.close();
});

test('TC-087 INGESTION.md PARSE_FAILED is terminal and is NOT a dead letter', async () => {
  const { store, rec } = await rig();
  await rec.start(job()); await rec.parseFailed(job(), 'malformed YAML at line 3');
  const j = await store.getJob('j1');
  assert.equal(j.status, JOB_STATUS.PARSE_FAILED);
  assert.equal(j.stage, 'PARSE_FAILED');
  assert.notEqual(j.stage, 'DEAD_LETTER', 'bad input is data, not a system failure');
  assert.match(j.error, /malformed YAML/);
  assert.equal(rec.counters().dead_lettered, undefined, 'parse failures must not inflate the DLQ counter');
  store.close();
});

test('TC-088 REQ-082 counters distinguish parse failures from dead letters', async () => {
  const { store, rec } = await rig();
  await rec.start(job({ jobId: 'a' })); await rec.parseFailed(job({ jobId: 'a' }), 'no frontmatter');
  await rec.start(job({ jobId: 'b' })); await rec.deadLettered(job({ jobId: 'b' }), new Error('source down'));
  await rec.start(job({ jobId: 'c' })); await rec.succeed(job({ jobId: 'c' }));
  const c = rec.counters();
  assert.equal(c.parse_failed, 1);
  assert.equal(c.dead_lettered, 1);
  assert.equal(c.parsed_succeeded, 1);
  store.close();
});

test('TC-089 REQ-017 a retry updates the attempt count rather than duplicating the job', async () => {
  const { store, rec } = await rig();
  await rec.start(job({ attempt: 1 }));
  await rec.fail(job({ attempt: 1 }), new Error('transient'));
  await rec.start(job({ attempt: 2 }));
  await rec.succeed(job({ attempt: 2 }));
  assert.equal((await rec.history('gitskills:o/r:SKILL.md')).length, 1, 'one job, not one per attempt');
  assert.equal((await store.getJob('j1')).attempt, 2);
  assert.equal((await store.getJob('j1')).status, JOB_STATUS.SUCCEEDED);
  store.close();
});

test('TC-090 NFR-028 JobRecorder refuses a missing port or clock', async () => {
  assert.throws(() => new JobRecorder({}), /CanonicalStore port and a clock/);
  assert.throws(() => new JobRecorder({ store: {} }), /clock/);
});

test('TC-091 DEF-001 completing a job must not move its start time', async () => {
  // Regression for DEF-001: succeed() spread a job object that did not carry
  // startedAt, binding undefined. The deeper defect was semantic - a completion
  // that overwrites started_at makes duration unmeasurable.
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  let t = '2026-08-27T10:00:00Z';
  const rec = new JobRecorder({ store, clock: () => t });
  const j = job();
  await rec.start(j);
  t = '2026-08-27T10:05:00Z';
  await rec.succeed(j);
  const row = await store.getJob('j1');
  assert.equal(row.started_at, '2026-08-27T10:00:00Z', 'start time preserved');
  assert.equal(row.completed_at, '2026-08-27T10:05:00Z');
  store.close();
});

test('TC-092 DEF-001 a job can be completed by identity alone', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const rec = new JobRecorder({ store, clock });
  await rec.start(job());
  // The caller does not restate startedAt; the store owns it.
  await assert.doesNotReject(async () => rec.succeed({ jobId: 'j1', skillRef: 'gitskills:o/r:SKILL.md',
    sourceId: 'gitskills', stage: 'PARSED', attempt: 1 }));
  store.close();
});
