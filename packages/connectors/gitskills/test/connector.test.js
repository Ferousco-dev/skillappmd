import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitSkillsCorpusConnector, FixtureCorpusReader, GITSKILLS_ACCESS_POLICY,
         stratifiedPlan, samplingDisclosure, REQUIRED_COLUMNS } from '../src/index.js';
import { assertConnectorContract } from '../../../ports/src/index.js';
import { syntheticCorpus } from '../fixtures/synthetic.js';

const CORPUS = syntheticCorpus({ rows: 1000 });
const conn = () => new GitSkillsCorpusConnector({ reader: new FixtureCorpusReader(CORPUS) });
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('TC-054 REQ-001/REQ-007 the connector satisfies the SourceConnector contract', async () => {
  assert.ok(assertConnectorContract(conn()));
});

test('TC-055 REQ-006 access policy declares concurrency and permitted methods', async () => {
  const p = GITSKILLS_ACCESS_POLICY;
  assert.equal(p.max_concurrency, 1);
  assert.ok(Array.isArray(p.permitted_methods));
  assert.ok(!p.permitted_methods.includes('html-bulk'));
});

test('TC-056 NFR-026 CC-BY-4.0 attribution travels with the access policy', async () => {
  const a = GITSKILLS_ACCESS_POLICY.attribution;
  assert.equal(a.licence, 'CC-BY-4.0');
  assert.equal(a.doi, '10.5281/zenodo.21875637');
  assert.match(GITSKILLS_ACCESS_POLICY.tos_notes, /COMPILATION, not the individual skills/);
});

test('TC-057 REQ-012 discovery honours a bounded batch limit', async () => {
  for (const limit of [10, 100, 250]) {
    const { records } = await conn().discover({ limit });
    assert.equal(records.length, limit, `expected exactly ${limit} records`);
  }
});

test('TC-058 REQ-002 every discovery record carries repository coordinates', async () => {
  const { records } = await conn().discover({ limit: 100 });
  for (const r of records) {
    assert.equal(r.source, 'gitskills');
    assert.match(r.repo_full_name, /^[^/]+\/[^/]+$/);
    assert.ok(r.path.length > 0);
    assert.ok(r.url.startsWith('https://github.com/'));
    assert.equal(r.external_id, `${r.repo_full_name}:${r.path}`);
  }
});

test('TC-059 DEC-014 identity derives from GitHub coordinates, never an aggregator id', async () => {
  const c = conn();
  const { records } = await c.discover({ limit: 5 });
  const id = c.identify(records[0]);
  assert.deepEqual(Object.keys(id).sort(), ['path', 'repo_full_name', 'source']);
  assert.equal(id.repo_full_name, records[0].repo_full_name);
});

test('TC-060 DEC-024 stratified sampling spans the size distribution; head sampling does NOT', async () => {
  // This is the test that justifies DEC-024. R3 measured the corpus to be size-ordered;
  // the fixture reproduces that. If stratification were dropped, this test fails loudly.
  const { records } = await conn().discover({ limit: 100, strata: 10 });
  const stratified = mean(records.map((r) => r.source_payload.body_chars));
  const head = mean(CORPUS.slice(0, 100).map((r) => r.body_chars));
  const population = mean(CORPUS.map((r) => r.body_chars));

  assert.ok(head < population * 0.5,
    `head sampling should badly understate the population (head ${head.toFixed(0)} vs population ${population.toFixed(0)})`);
  assert.ok(Math.abs(stratified - population) < population * 0.35,
    `stratified should approximate the population (stratified ${stratified.toFixed(0)} vs population ${population.toFixed(0)})`);
  assert.ok(stratified > head * 3, 'stratified must differ materially from head sampling');
});

test('TC-061 DEC-024 the sample spans the whole offset range, not one end', async () => {
  const { records } = await conn().discover({ limit: 100, strata: 10 });
  const offsets = records.map((r) => r.source_payload._corpus_offset);
  assert.ok(Math.min(...offsets) < CORPUS.length * 0.1);
  assert.ok(Math.max(...offsets) > CORPUS.length * 0.8);
  assert.equal(new Set(offsets).size, 10, 'exactly one read range per stratum');
});

test('TC-062 REQ-085 discovery emits a sampling disclosure with its bias', async () => {
  const { disclosure } = await conn().discover({ limit: 100 });
  assert.equal(disclosure.method, 'stratified-by-offset');
  assert.equal(disclosure.sampled, 100);
  assert.equal(disclosure.population, 1000);
  assert.match(disclosure.bias, /ordered by file size/);
  assert.ok(disclosure.caveats.some((c) => /decays|lower bound/.test(c)));
});

test('TC-063 NFR-001 discovery is deterministic: two runs are byte-identical', async () => {
  const a = await conn().discover({ limit: 100 });
  const b = await conn().discover({ limit: 100 });
  assert.equal(JSON.stringify(a.records), JSON.stringify(b.records));
});

test('TC-064 R3 content is available only on dedup primaries', async () => {
  const c = conn();
  const { records } = await c.discover({ limit: 200 });
  let available = 0, unavailable = 0;
  for (const r of records) {
    const got = c.getContent(r);
    if (got.status === 'ok') { available++; assert.equal(r.source_payload.dedup_primary, 1); }
    else { unavailable++; assert.equal(got.status, 'NotAvailable'); }
  }
  assert.ok(available > 0 && unavailable > 0, 'fixture must exercise both paths');
});

test('TC-065 REQ-047 the dedup oracle is surfaced as metadata, not silently consumed', async () => {
  const c = conn();
  const { records } = await c.discover({ limit: 100 });
  const m = c.getMetadata(records[0]);
  assert.equal(typeof m.dedup_primary, 'boolean');
  assert.equal(typeof m.frontmatter_valid, 'boolean');
  assert.equal(typeof m.has_scripts, 'boolean');
});

test('TC-066 DEC-012 version ref is the git blob sha, labelled as such', async () => {
  const c = conn();
  const { records } = await c.discover({ limit: 5 });
  assert.equal(c.getVersion(records[0]).kind, 'git-blob-sha');
});

test('TC-067 REQ-032 the verbatim source payload is retained for reprocessing', async () => {
  const { records } = await conn().discover({ limit: 5 });
  for (const col of REQUIRED_COLUMNS) {
    assert.ok(col in records[0].source_payload, `source_payload must retain ${col}`);
  }
});

test('TC-068 stratifiedPlan covers the range and sums to the requested size', async () => {
  const plan = stratifiedPlan({ total: 3_797_117, sampleSize: 100, strata: 10 });
  assert.equal(plan.reduce((a, p) => a + p.length, 0), 100);
  assert.equal(plan.length, 10);
  assert.equal(plan[0].offset, 0);
  assert.ok(plan.at(-1).offset > 3_000_000, 'the last stratum must reach the large-file end');
});

test('TC-069 stratifiedPlan handles awkward sizes without losing records', async () => {
  for (const n of [1, 3, 7, 13, 99, 101]) {
    const plan = stratifiedPlan({ total: 1000, sampleSize: n, strata: 10 });
    assert.equal(plan.reduce((a, p) => a + p.length, 0), n, `sampleSize ${n} must be exact`);
  }
});

test('TC-070 INVALID_CURSOR is reported rather than silently ignored', async () => {
  await assert.rejects(() => conn().discover({ limit: 10, cursor: 'garbage' }), /INVALID_CURSOR/);
});

test('TC-136 REQ-024 transient failures retry with backoff; permanent ones do not', async (t) => {
  const { fetchWithRetry } = await import('../src/retry.js');
  const orig = globalThis.fetch;
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  try {
    // Transient: the real observed case - HTTP 500 "dataset index is loading".
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls < 3
        ? { ok: false, status: 500, headers: new Map([]), text: async () => 'loading' }
        : { ok: true, status: 200 };
    };
    const res = await fetchWithRetry('https://x', { sleep, rng: () => 0.5, baseMs: 100 });
    assert.equal(res.ok, true);
    assert.equal(calls, 3, 'retried twice, then succeeded');
    assert.equal(waits.length, 2);
    assert.ok(waits[1] > waits[0], 'backoff grows between attempts');

    // Permanent: a 404 must NOT be retried - retrying a permanent failure burns
    // the source's quota for nothing (NFR-023).
    calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: false, status: 404, headers: new Map() }; };
    await assert.rejects(() => fetchWithRetry('https://x', { sleep }), /HTTP 404/);
    assert.equal(calls, 1, 'a permanent failure is attempted exactly once');
  } finally { globalThis.fetch = orig; }
});

test('TC-137 NFR-023 a stated Retry-After overrides our own backoff', async () => {
  const { fetchWithRetry } = await import('../src/retry.js');
  const orig = globalThis.fetch;
  const waits = [];
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? { ok: false, status: 429, headers: new Map([['retry-after', '7']]) }
        : { ok: true, status: 200 };
    };
    await fetchWithRetry('https://x', { sleep: async (ms) => { waits.push(ms); }, baseMs: 100 });
    assert.equal(waits[0], 7000, 'the source\'s stated delay is honoured, not our shorter one');
  } finally { globalThis.fetch = orig; }
});


test('TC-165 DEF-004/NFR-021 a repo name that cannot be safely queried is excluded, not interpolated', async () => {
  const { isQueryableName } = await import('../src/repo-licence-reader.js');
  // The real case, found at the 1,000 rung: GitHub allows repeated hyphens, and `--`
  // is a SQL comment marker. The service returned 422; a more permissive parser
  // would have returned WRONG DATA silently.
  assert.equal(isQueryableName('Michaelunkai/study--AI_ML-Artificial_Intelligence-openclaw'), false);
  const unsafe = ["o/r';DROP TABLE x;--", 'o/r"quote', 'o/r;semi', 'o/r/*comment*/', 'o/r\\back'];
  for (const bad of unsafe) {
    assert.equal(isQueryableName(bad), false, JSON.stringify(bad) + ' must be refused');
  }
  for (const ok of ['owner/repo', 'Some-Owner/some_repo.v2', 'a0/b-c_d.e']) {
    assert.equal(isQueryableName(ok), true, ok + ' must remain queryable');
  }
});

test('TC-166 DEF-004 an unqueryable name resolves to no licence, which is rights UNKNOWN', async () => {
  const { RepoLicenceReader } = await import('../src/repo-licence-reader.js');
  const r = new RepoLicenceReader({ cacheDir: '/tmp/appmd-test-cache-' + Date.now() });
  const unsafe = 'Michaelunkai/study--AI_ML-openclaw';
  const m = await r.lookup([unsafe]);       // no network: it never becomes a request
  assert.equal(m.get(unsafe), null, 'no licence -> L2 UNKNOWN -> rights unknown (DEC-018)');
  assert.deepEqual(r.unqueryable, [unsafe], 'and it is REPORTED, never silently dropped');
  assert.equal(r.requests, 0, 'no query was constructed from an unsafe name');
});
