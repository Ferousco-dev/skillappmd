import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouter } from '../src/router.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         rebuildSearchIndex } from '../../../packages/ingestion/src/index.js';

const clock = () => '2026-08-27T13:45:00Z';
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

test('TC-163 NFR-012 GET /skills/:id is <=200ms at p95 over a 10,000-skill store', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: clock() });

  const ids = [];
  const t0 = Date.now();
  for (let i = 0; i < 10_000; i++) {
    const raw = `---\nname: skill-${i}\ndescription: Synthetic record ${i} for the performance target.\n---\nBody ${i}.`;
    const d = { source: 'gitskills', external_id: `o/r${i}:SKILL.md`, repo_full_name: `o/r${i}`,
      path: 'SKILL.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/SKILL.md`,
      discovered_at: new Date(Date.UTC(2026, 7, 27, 0, 0, i % 60, i)).toISOString(), source_payload: {} };
    const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw,
                          repoLicence: i % 3 === 0 ? 'MIT' : null, now: d.discovered_at });
    await resolveOccurrence({ store, discovery: d, canonical: c, fingerprints: fingerprint(raw), now: clock() });
    ids.push(c.id);
  }
  const buildMs = Date.now() - t0;
  assert.equal((await store.counts()).canonical, 10_000);

  const router = new ApiRouter({ store, clock, limiter: null });
  // Warm, then measure a spread of ids so we are not benchmarking one hot row.
  for (let i = 0; i < 50; i++) await router.handle({ method: 'GET', path: `/api/v1/skills/${ids[i]}`, query: {} });

  const samples = [];
  for (let i = 0; i < 500; i++) {
    const id = ids[(i * 7919) % ids.length];
    const s = performance.now();
    const r = await router.handle({ method: 'GET', path: `/api/v1/skills/${id}`, query: {} });
    samples.push(performance.now() - s);
    assert.equal(r.status, 200);
  }

  const p50 = pct(samples, 0.50), p95 = pct(samples, 0.95), p99 = pct(samples, 0.99);
  console.log(`      NFR-012: build ${buildMs}ms for 10,000 · p50 ${p50.toFixed(2)}ms · p95 ${p95.toFixed(2)}ms · p99 ${p99.toFixed(2)}ms`);
  assert.ok(p95 <= 200, `p95 ${p95.toFixed(2)}ms must be <= 200ms`);
  store.close();
});

test('TC-164 NFR-032 cursor pagination does not degrade with depth', async () => {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: clock() });
  for (let i = 0; i < 5_000; i++) {
    const raw = `---\nname: s-${i}\ndescription: d${i}\n---\nB${i}`;
    const d = { source: 'gitskills', external_id: `o/r${i}:S.md`, repo_full_name: `o/r${i}`,
      path: 'S.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/S.md`,
      discovered_at: new Date(Date.UTC(2026, 7, 27, 0, 0, 0, i)).toISOString(), source_payload: {} };
    const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw, repoLicence: 'MIT', now: d.discovered_at });
    await resolveOccurrence({ store, discovery: d, canonical: c, fingerprints: fingerprint(raw), now: clock() });
  }
  const router = new ApiRouter({ store, clock, limiter: null });

  const timings = [];
  let cursor = null, pages = 0, seen = 0;
  do {
    const s = performance.now();
    const r = await router.handle({ method: 'GET', path: '/api/v1/skills', query: { cursor, limit: 100 } });
    timings.push(performance.now() - s);
    seen += r.body.data.length; cursor = r.body.cursor.next; pages++;
  } while (cursor && pages < 60);

  assert.equal(seen, 5_000, 'every record seen exactly once');
  const first = timings.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const last = timings.slice(-5).reduce((a, b) => a + b, 0) / 5;
  console.log(`      NFR-032: ${pages} pages · first-5 avg ${first.toFixed(2)}ms · last-5 avg ${last.toFixed(2)}ms`);
  // Offset pagination degrades linearly with depth; a cursor must not.
  assert.ok(last < first * 3, `deep pages (${last.toFixed(2)}ms) must not degrade vs early (${first.toFixed(2)}ms)`);
  store.close();
});
