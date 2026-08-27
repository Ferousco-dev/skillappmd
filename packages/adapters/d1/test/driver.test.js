/**
 * CR-011. The D1 driver seam.
 *
 * The contract suite already runs all 40+ store tests through this driver, so behaviour
 * is covered there. What is covered HERE is the adaptation itself — the three things
 * that differ between node:sqlite and D1, each of which fails silently or confusingly
 * when it is wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D1Driver } from '../src/index.js';
import { FakeD1Database } from '../src/fake-d1.js';
import { createD1CanonicalStore } from '../src/index.js';

const NOW = '2026-08-27T13:45:00Z';

test('TC-339 REQ-106 exec strips SQL comments BEFORE flattening, or the DDL is truncated', async () => {
  // The bug this test exists for: joining lines first turns
  //   `id TEXT NOT NULL,     -- NFR-033`
  // into a line where the comment swallows every column after it. D1 then reports only
  // "incomplete input", which names neither the table nor the comment.
  const db = new FakeD1Database();
  const driver = new D1Driver(db);

  await driver.exec(`
    CREATE TABLE widget (
      id TEXT PRIMARY KEY,          -- a trailing comment
      label TEXT NOT NULL,          -- another one
      count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await driver.prepare('INSERT INTO widget (id, label) VALUES (?, ?)').run('w1', 'first');
  const row = await driver.prepare('SELECT * FROM widget WHERE id = ?').get('w1');
  assert.equal(row.label, 'first');
  assert.equal(row.count, 0, 'the column defined AFTER a comment must survive');
});

test('TC-340 CR-011 exec runs every statement, not just the first', async () => {
  const driver = new D1Driver(new FakeD1Database());
  const r = await driver.exec('CREATE TABLE a (x TEXT);\nCREATE TABLE b (y TEXT);');
  assert.equal(r.count, 2);
  await driver.prepare('INSERT INTO b (y) VALUES (?)').run('ok');
  assert.equal((await driver.prepare('SELECT y FROM b').get()).y, 'ok');
});

test('TC-341 CR-011 the fake ENFORCES D1 line-orientation instead of tolerating it', async () => {
  // A fake that accepts multi-line DDL lets a migration pass in tests and fail on the
  // real binding - the one failure mode a fake exists to prevent.
  const db = new FakeD1Database();
  await assert.rejects(
    () => db.exec('CREATE TABLE bad (\n  id TEXT\n);'),
    /line-oriented/,
    'the fake must refuse what the real binding would refuse');
});

test('TC-342 CR-011 parameters bind through .bind(), and .all() unwraps { results }', async () => {
  const driver = new D1Driver(new FakeD1Database());
  await driver.exec('CREATE TABLE t (n INTEGER);');
  for (const n of [1, 2, 3]) await driver.prepare('INSERT INTO t (n) VALUES (?)').run(n);

  const rows = await driver.prepare('SELECT n FROM t WHERE n > ? ORDER BY n').all(1);
  assert.ok(Array.isArray(rows), '.all() must return an array, not D1\'s { results } wrapper');
  assert.deepEqual(rows.map((r) => r.n), [2, 3]);

  assert.equal(await driver.prepare('SELECT n FROM t WHERE n = ?').get(99), null,
    'a miss is null, matching node:sqlite, not undefined');
});

test('TC-343 CR-011 a D1 store refuses a binding that is not a D1Database', () => {
  // A wrong binding name in wrangler.toml gives `undefined`, and the failure should name
  // the cause at construction rather than surfacing as a null-property error mid-request.
  assert.throws(() => new D1Driver(undefined), /D1Database binding/);
  assert.throws(() => new D1Driver({}), /D1Database binding/);
});

test('TC-344 REQ-106 the D1 store runs the real migrations to the current schema', async () => {
  const store = createD1CanonicalStore(new FakeD1Database());
  const result = await store.migrate({ now: NOW });
  assert.equal(await store.schemaVersion(), 3, 'the same schema version as the local adapter');
  assert.ok(result.applied.length >= 1);
  const counts = await store.counts();
  assert.deepEqual(counts, { canonical: 0, occurrences: 0, repositories: 0, jobs: 0, tombstones: 0 });
});
