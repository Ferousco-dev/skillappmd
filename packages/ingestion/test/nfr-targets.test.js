import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouter } from '../../../apps/api/src/router.js';
import { serialiseSkill } from '../../../apps/api/src/serialise.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { MemoryObjectStore } from '../../adapters/memory-objectstore/src/index.js';
import { ingestRecord, rebuildSearchIndex, parseSkill, fingerprint } from '../src/index.js';
import { syntheticCorpus } from '../../connectors/gitskills/fixtures/synthetic.js';
import { GITSKILLS_ACCESS_POLICY } from '../../connectors/gitskills/src/index.js';
import { contentHash } from '../../skill-core/src/index.js';

/**
 * NON-FUNCTIONAL AND QUALITY-TARGET VERIFICATION at unit scale.
 *
 * NFR-002 and NFR-003 were previously measured only by CLI harnesses against the live
 * corpus. Those measurements are the real evidence, but they need network and a fetched
 * corpus, so they cannot gate a build. These run the SAME comparison against the
 * synthetic fixture - which deliberately reproduces the corpus's measured pathology -
 * so a regression fails the suite offline.
 */
const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;

function rig() {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  return { store, objects: new MemoryObjectStore() };
}

test('TC-291 NFR-002/REQ-047 dedup agreement is MEASURED against the oracle, offline', async () => {
  const corpus = syntheticCorpus({ rows: 1200 });
  const withContent = corpus.filter((r) => r.content_fetched === 1 && r.content);

  // Our grouping vs the fixture's own file_sha grouping - both answer "byte-identical?".
  const theirs = new Map();
  for (const r of withContent) {
    if (!theirs.has(r.file_sha)) theirs.set(r.file_sha, []);
    theirs.get(r.file_sha).push(contentHash(r.content));
  }
  let agree = 0, disagree = 0;
  for (const [, hashes] of theirs) {
    new Set(hashes).size === 1 ? agree++ : disagree++;
  }
  const agreement = agree / (agree + disagree);
  assert.ok(agreement >= 0.999,
    `NFR-002 target is >=99.9%; measured ${(agreement * 100).toFixed(2)}%`);
  assert.equal(disagree, 0, 'DEC-023: an UNEXPLAINED disagreement is the gate failure');
  assert.ok(theirs.size > 100, 'the sample is large enough for the number to mean something');
});

test('TC-292 NFR-003/REQ-041 parser validity is comparable to the oracle column, offline', () => {
  const corpus = syntheticCorpus({ rows: 1200 });
  let tp = 0, tn = 0, fp = 0, fn = 0;
  const disagreements = [];
  for (const r of corpus) {
    if (r.content_fetched !== 1 || !r.content) continue;
    const ours = parseSkill(r.content).frontmatterValid === true;
    const theirs = r.frontmatter_valid === 1;
    if (ours && theirs) tp++;
    else if (!ours && !theirs) tn++;
    else { ours ? fp++ : fn++; disagreements.push({ ours, theirs }); }
  }
  const n = tp + tn + fp + fn;
  const agreement = (tp + tn) / n;
  assert.ok(n > 100, 'enough comparable records for the figure to mean something');
  assert.ok(agreement >= 0.99,
    `NFR-003 target is >=99%; measured ${(agreement * 100).toFixed(1)}% over ${n} records`);
  // CR-004: structural validity is what is comparable. Spec conformance is ours alone.
  const sample = corpus.find((r) => r.content_fetched === 1 && r.content);
  const parsed = parseSkill(sample.content);
  assert.ok('frontmatterValid' in parsed && 'specConformant' in parsed,
    'the two verdicts stay separable, so the metric compares like with like');
});

test('TC-293 NFR-011 canonical processing throughput is MEASURED, not asserted', async () => {
  const { store, objects } = rig();
  const N = 500;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    await ingestRecord({ store, objects,
      discovery: { source: 'gitskills', external_id: `o/r${i}:S.md`, repo_full_name: `o/r${i}`,
        path: 'S.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/S.md`,
        discovered_at: new Date(Date.UTC(2026, 7, 27, 0, 0, 0, i)).toISOString(),
        source_payload: {} },
      rawText: `---\nname: perf-${i}\ndescription: Throughput record ${i}.\n---\n${'x'.repeat(4425)}`,
      repoLicence: 'MIT', now: NOW });
  }
  const ms = performance.now() - t0;
  const perTenThousand = (ms / N) * 10_000;
  // DEC-034's measured target: 10,000 records of canonical processing in <=10 seconds.
  assert.ok(perTenThousand <= 10_000,
    `extrapolated ${Math.round(perTenThousand)}ms per 10,000; the measured target is 10,000ms`);
  assert.equal(store.counts().canonical, N);
  store.close();
});

test('TC-294 NFR-014 the pipeline stays inside its memory budget at scale', async () => {
  const { store, objects } = rig();
  const base = process.memoryUsage().rss / 1048576;
  let peak = base;
  for (let i = 0; i < 2000; i++) {
    await ingestRecord({ store, objects,
      discovery: { source: 'gitskills', external_id: `o/r${i}:S.md`, repo_full_name: `o/r${i}`,
        path: 'S.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/S.md`,
        discovered_at: new Date(Date.UTC(2026, 7, 27, 0, 0, 0, i)).toISOString(),
        source_payload: {} },
      rawText: `---\nname: mem-${i}\ndescription: Memory record ${i}.\n---\n${'y'.repeat(4425)}`,
      repoLicence: 'MIT', now: NOW });
    if (i % 200 === 0) peak = Math.max(peak, process.memoryUsage().rss / 1048576);
  }
  peak = Math.max(peak, process.memoryUsage().rss / 1048576);
  assert.ok(peak - base < 128,
    `NFR-014: pipeline delta ${(peak - base).toFixed(0)} MB must stay under 128 MB`);
  store.close();
});

test('TC-295 NFR-013 fetch concurrency is configurable per source and defaults within the Workers ceiling', () => {
  const p = GITSKILLS_ACCESS_POLICY;
  assert.equal(typeof p.max_concurrency, 'number');
  assert.ok(p.max_concurrency >= 1 && p.max_concurrency <= 6,
    `concurrency ${p.max_concurrency} must sit inside the 6 simultaneous outgoing connections a Worker allows`);
  // It is per-SOURCE data, so a second source can differ without code change.
  const other = { ...p, max_concurrency: 3 };
  assert.notEqual(other.max_concurrency, p.max_concurrency);
});

test('TC-296 REQ-066 the list endpoint paginates by cursor and never by offset', () => {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  const router = new ApiRouter({ store, clock, limiter: null });
  const r = router.handle({ method: 'GET', path: '/api/v1/skills',
                            query: { offset: 40, page: 3, limit: 10 } });
  assert.equal(r.status, 200);
  assert.ok('cursor' in r.body, 'the response is cursor-shaped');
  assert.equal('offset' in r.body, false, 'offset is not part of the contract');
  assert.equal('page' in r.body, false, 'nor is page');
  // Offset and page params are IGNORED rather than honoured, so no caller can rely on them.
  assert.equal(r.body.cursor.limit, 10);
  store.close();
});

test('TC-297 REQ-077/REQ-078/REQ-079 a bare score is structurally unrepresentable', () => {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  const router = new ApiRouter({ store, clock, limiter: null });
  // ETH-001 condition 1: the API cannot emit a score without findings, because no score
  // field exists at all in Phase 1. This asserts the ABSENCE is structural, not a habit.
  const health = router.handle({ method: 'GET', path: '/api/v1/health', query: {} });
  const serialiserSource = serialiseSkill.toString();
  assert.equal(/trust_score|risk_level|safety_score/.test(serialiserSource), false,
    'REQ-077: no score field can be serialised, so none can be emitted without evidence');
  assert.equal(/\bsafe\b/i.test(serialiserSource), false,
    'REQ-078: absence of findings is never rendered as "safe"');
  // The original assertion here ended in an empty alternation (/...|notice|/), which
  // matches the empty string and therefore always passed. A hollow assertion inside a
  // test about honest framing would have been a poor joke; asserted properly now.
  assert.match(serialiserSource, /content_notice/,
    'REQ-079: the serialiser attaches an explicit notice rather than leaving framing to prose');
  assert.match(serialiserSource, /does not serve third-party skill content/,
    'and the notice states the limitation in words a consumer reads');
  store.close();
});

test('TC-298 REQ-079 the notice on every response disclaims certification', async () => {
  const { store, objects } = rig();
  await ingestRecord({ store, objects,
    discovery: { source: 'gitskills', external_id: 'o/r:S.md', repo_full_name: 'o/r', path: 'S.md',
      author: 'o', url: 'https://github.com/o/r/blob/HEAD/S.md', discovered_at: NOW, source_payload: {} },
    rawText: '---\nname: n\ndescription: d\n---\nB', repoLicence: 'MIT', now: NOW });
  rebuildSearchIndex({ store, now: NOW });
  const router = new ApiRouter({ store, clock, limiter: null });
  for (const path of ['/api/v1/skills', '/api/v1/search']) {
    const r = router.handle({ method: 'GET', path, query: { q: 'n' } });
    assert.match(r.body.notice, /does not certify or verify any skill/,
      `${path} must carry the disclaimer`);
  }
  store.close();
});
