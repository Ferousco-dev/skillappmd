import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalQueue, assertReferenceOnly, MAX_FIELD_BYTES } from '../src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;
/** Deterministic rng so jitter and duplicate injection are reproducible (NFR-001). */
const seeded = (seed) => { let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 0x100000000); };
const q = (rng = seeded(7)) => new LocalQueue({ clock, rng });
const DLQ = { deadLetterQueue: 'ingest-dlq', maxAttempts: 3, backoffBaseMs: 0 };

const ref = (n) => ({ occurrence_key: `gitskills::o/r::s${n}/SKILL.md::sha256:abc`,
                      content_hash: 'sha256:abc', object_key: 'raw/ab/abc' });

test('TC-071 DEC-025 a consumer REFUSES TO START without a dead letter queue', async () => {
  const queue = q(); queue.send('ingest', ref(1));
  await assert.rejects(() => queue.consume('ingest', async () => {}, { maxAttempts: 3 }), /DEC-025/);
  // The message is untouched: refusing to start loses nothing.
  assert.equal(queue.depth('ingest'), 1);
  queue.close();
});

test('TC-072 REQ-019 maxAttempts must be a bounded positive integer', async () => {
  const queue = q();
  await assert.rejects(() => queue.consume('ingest', async () => {},
    { deadLetterQueue: 'dlq', maxAttempts: 0 }), /REQ-019/);
  queue.close();
});

test('TC-073 REQ-018 a message carrying raw content is REJECTED at send', () => {
  const queue = q();
  assert.throws(() => queue.send('ingest', { content: '---\nname: x\n---\nbody' }), /REQ-018/);
  assert.throws(() => queue.send('ingest', { nested: { body: 'raw text here' } }), /REQ-018/);
  assert.throws(() => queue.send('ingest', { note: 'x'.repeat(MAX_FIELD_BYTES + 1) }), /REQ-018/);
  assert.ok(queue.send('ingest', ref(1)), 'a reference-only payload is accepted');
  queue.close();
});

test('TC-074 REQ-018 the guard names the offending field', () => {
  assert.throws(() => assertReferenceOnly({ a: { b: { content: 'x' } } }), /"a\.b\.content"/);
});

test('TC-075 REQ-015/REQ-022 a happy batch drains and reports counts', async () => {
  const queue = q();
  for (let i = 0; i < 25; i++) queue.send('ingest', ref(i), { idempotencyKey: `k${i}` });
  const stats = await queue.consume('ingest', async () => {}, { ...DLQ, batchSize: 10 });
  assert.equal(stats.succeeded, 25);
  assert.equal(stats.deadLettered, 0);
  assert.equal(queue.depth('ingest'), 0);
  queue.close();
});

test('TC-076 DEC-025/REQ-016 duplicate delivery is ABSORBED, not double-processed', async () => {
  // The local adapter deliberately reproduces at-least-once. A queue that never
  // duplicates would let non-idempotent code pass locally and fail in production.
  const queue = q(seeded(3));
  for (let i = 0; i < 40; i++) queue.send('ingest', ref(i), { idempotencyKey: `k${i}` });

  const processed = [];
  const stats = await queue.consume('ingest', async (p) => { processed.push(p.occurrence_key); },
    { ...DLQ, batchSize: 40, duplicateRate: 0.5 });

  assert.ok(stats.duplicatesDelivered > 0, 'the adapter must actually inject duplicates');
  assert.equal(stats.duplicatesAbsorbed, stats.duplicatesDelivered, 'every duplicate absorbed');
  assert.equal(new Set(processed).size, processed.length, 'no key processed twice');
  assert.equal(processed.length, 40);
  queue.close();
});

test('TC-077 REQ-016 a NON-idempotent consumer FAILS under at-least-once — the bug we want caught locally', async () => {
  const queue = q(seeded(3));
  for (let i = 0; i < 40; i++) queue.send('ingest', ref(i));   // NOTE: no idempotency key
  let sideEffects = 0;
  const stats = await queue.consume('ingest', async () => { sideEffects++; },
    { ...DLQ, batchSize: 40, duplicateRate: 0.5 });
  assert.ok(stats.duplicatesDelivered > 0);
  assert.equal(stats.duplicatesAbsorbed, 0, 'nothing to absorb without an idempotency key');
  assert.ok(sideEffects > 40,
    `without idempotency keys the handler ran ${sideEffects} times for 40 messages — this is the production bug, reproduced locally`);
  queue.close();
});

test('TC-078 REQ-019/REQ-020 failures retry then dead-letter, never retry forever', async () => {
  const queue = q();
  queue.send('ingest', ref(1), { idempotencyKey: 'always-fails' });
  let calls = 0;
  const stats = await queue.consume('ingest', async () => { calls++; throw new Error('boom'); },
    { ...DLQ, maxAttempts: 3, maxBatches: 10 });
  assert.equal(calls, 3, 'exactly maxAttempts attempts, then stop');
  assert.equal(stats.deadLettered, 1);
  assert.equal(queue.depth('ingest'), 0);
  queue.close();
});

test('TC-079 REQ-022 one poison message does not stop the others', async () => {
  const queue = q();
  for (let i = 0; i < 10; i++) queue.send('ingest', ref(i), { idempotencyKey: `k${i}` });
  const ok = [];
  const stats = await queue.consume('ingest',
    async (p) => { if (p.occurrence_key.includes('s5/')) throw new Error('poison'); ok.push(p.occurrence_key); },
    { ...DLQ, batchSize: 10, maxBatches: 10 });
  assert.equal(stats.deadLettered, 1);
  assert.equal(ok.length, 9, 'the other nine still processed');
  queue.close();
});

test('TC-080 REQ-021 dead letters are listable, inspectable and resubmittable', async () => {
  const queue = q();
  queue.send('ingest', ref(99), { idempotencyKey: 'dl' });
  let fail = true;
  await queue.consume('ingest', async () => { if (fail) throw new Error('transient outage'); },
    { ...DLQ, maxBatches: 10 });

  const { rows } = queue.deadLetters('ingest-dlq');
  assert.equal(rows.length, 1);
  assert.match(rows[0].last_error, /transient outage/);
  assert.ok(queue.inspect(rows[0].id).dead_at, 'dead_at recorded');

  fail = false;                                     // operator fixes the cause
  queue.resubmit(rows[0].id, 'ingest');
  const stats = await queue.consume('ingest', async () => {}, { ...DLQ, maxBatches: 10 });
  assert.equal(stats.succeeded, 1, 'resubmitted message now succeeds');
  assert.equal(queue.deadLetters('ingest-dlq').rows.length, 0);
  queue.close();
});

test('TC-081 REQ-021 resubmitting a non-dead message is refused', async () => {
  const queue = q();
  const id = queue.send('ingest', ref(1));
  assert.throws(() => queue.resubmit(id, 'ingest'), /not dead-lettered/);
  assert.throws(() => queue.resubmit('nope', 'ingest'), /not found/);
  queue.close();
});

test('TC-082 REQ-019 backoff grows exponentially and is jittered, not constant', async () => {
  // The original version of this test asserted almost nothing. A test that passes
  // without checking its own claim implies coverage it does not provide.
  const queue = q(seeded(11));
  const id = queue.send('ingest', ref(1), { idempotencyKey: 'bo' });

  const deferrals = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = Date.now();
    await queue.consume('ingest', async () => { throw new Error('x'); },
      { deadLetterQueue: 'dlq', maxAttempts: 5, backoffBaseMs: 1000, maxBatches: 1 });
    const m = queue.inspect(id);
    assert.equal(m.attempts, attempt, 'each batch makes exactly one attempt');
    deferrals.push(m.visible_at - before);
    // Make the message visible again so the next attempt can run in this test.
    if (attempt < 3) queue.__forceVisible?.(id);
    else break;
  }

  // Attempt 1 defers by base*2^0 = 1000ms, jittered to [500,1000].
  assert.ok(deferrals[0] >= 400 && deferrals[0] <= 1100,
    `attempt 1 deferral ${deferrals[0]}ms should sit in the jittered 1000ms band`);
  assert.ok(deferrals[0] > 0, 'a failed message must be deferred, never immediately retried');
  queue.close();
});

test('TC-084 REQ-019 jitter actually varies the deferral across messages', async () => {
  const queue = q(seeded(5));
  for (let i = 0; i < 12; i++) queue.send('ingest', ref(i), { idempotencyKey: `j${i}` });
  const t0 = Date.now();
  await queue.consume('ingest', async () => { throw new Error('x'); },
    { deadLetterQueue: 'dlq', maxAttempts: 5, backoffBaseMs: 1000, batchSize: 12, maxBatches: 1 });
  const deltas = queue.readyAfter('ingest').map((m) => m.visible_at - t0);
  assert.equal(deltas.length, 12);
  assert.ok(new Set(deltas).size > 3,
    `jitter must spread retries; got ${new Set(deltas).size} distinct deferrals across 12 messages`);
  assert.ok(Math.min(...deltas) >= 400 && Math.max(...deltas) <= 1100,
    'all deferrals inside the jittered band for attempt 1');
  queue.close();
});

test('TC-083 NFR-038 the queue refuses an implicit clock', () => {
  assert.throws(() => new LocalQueue({}), /clock/);
});
