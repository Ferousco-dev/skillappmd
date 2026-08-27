import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkillsMPConnector, SkillsMPQueryRequired, SKILLSMP_ACCESS_POLICY,
         SEARCH_LIMITS, repoFromGithubUrl, CircuitBreaker, BREAKER_STATE,
         RobotsPolicy, ConditionalFetcher } from '../src/index.js';
import { assertConnectorContract } from '../../../ports/src/index.js';

/**
 * SkillsMPConnector — REQ-004.
 *
 * Offline (NFR-030) against fixtures RECORDED FROM THE LIVE API on 2026-08-27, so the
 * shapes asserted here are the shapes SkillsMP actually returns, not shapes I imagined.
 * That distinction has mattered four times in this project (DEF-002, 003, 005, 008).
 */
const FX = JSON.parse(readFileSync(new URL('../fixtures/recorded.json', import.meta.url), 'utf8'));

/** A fetch double that replays a recorded response. */
const replay = (key) => async () => ({
  ok: FX[key].status === 200, status: FX[key].status,
  headers: new Map(),
  json: async () => FX[key].body,
});
const conn = (over = {}) => new SkillsMPConnector({ fetchImpl: replay('search_pdf'), ...over });

test('TC-299 REQ-001/REQ-007 SkillsMPConnector satisfies the SourceConnector contract', () => {
  assert.ok(assertConnectorContract(conn()));
});

test('TC-300 REQ-026 the connector refuses to impersonate a browser or another bot', () => {
  for (const bad of ['Mozilla/5.0 (Macintosh)', 'Googlebot/2.1', 'Chrome/120', 'curl/8.0']) {
    assert.throws(() => new SkillsMPConnector({ userAgent: bad }), /REQ-026 violated/,
      `"${bad}" must be refused at construction`);
  }
  // Truthful and contactable is accepted.
  assert.doesNotThrow(() => new SkillsMPConnector({
    userAgent: 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; contact a@b.c)' }));
});

test('TC-301 REQ-006/DOM-012 the access policy carries SkillsMP\'s published limits as data', () => {
  const anon = conn().accessPolicy();
  assert.equal(anon.requests_per_minute, 10);
  assert.equal(anon.requests_per_day, 50);
  assert.equal(anon.auth, 'none');
  // A key raises the ceiling; the policy is data, so nothing in the pipeline changes.
  const keyed = conn({ apiKey: 'sk_live_test' }).accessPolicy();
  assert.equal(keyed.requests_per_day, 500);
  assert.equal(keyed.requests_per_minute, 30);
  assert.equal(keyed.auth, 'bearer');
  // REQ-004: the forbidden method is named, not merely omitted.
  assert.ok(anon.forbidden.includes('html-bulk'));
  assert.equal(anon.permitted_methods.includes('html-bulk'), false);
});

test('TC-302 REQ-004 enumeration is impossible and the connector does not pretend otherwise', async () => {
  const c = conn();
  assert.equal(typeof c.discoverAll, 'undefined', 'no method implies a full crawl');
  // `q` is required; wildcards are unsupported. Both are refused before any request.
  for (const q of [undefined, '', '   ', '*']) {
    await assert.rejects(() => c.discover({ q }), SkillsMPQueryRequired);
  }
  assert.equal(c.requests, 0, 'and no request was issued for any of them');
  assert.equal(SEARCH_LIMITS.MAX_RESULTS_PER_QUERY, 2500, '50 pages x 50 results is the hard ceiling');
});

test('TC-303 REQ-002 discovery emits the normalised record shape from real API data', async () => {
  const { records } = await conn().discover({ q: 'pdf', limit: 5 });
  assert.ok(records.length > 0);
  for (const r of records) {
    assert.equal(r.source, 'skillsmp');
    assert.equal(r.channel, 'rest', 'REQ-096: the access channel is recorded on every record');
    assert.ok(r.external_id);
    // DEC-014: the URL points at the ORIGIN repository, never the aggregator page.
    if (r.url) assert.match(r.url, /^https:\/\/github\.com\//);
    assert.equal(/skillsmp\.com/.test(r.url ?? ''), false);
    assert.equal(r.license_hint, null, 'SkillsMP grants no rights and states none');
    assert.ok('source_payload' in r, 'REQ-032: the verbatim payload is retained');
  }
});

test('TC-304 DEC-014 identity comes from GitHub coordinates, not the SkillsMP id', async () => {
  const c = conn();
  const { records } = await c.discover({ q: 'pdf' });
  const withRepo = records.find((r) => r.repo_full_name);
  assert.ok(withRepo, 'the fixture contains at least one resolvable repository');
  const id = c.identify(withRepo);
  assert.match(id.repo_full_name, /^[^/]+\/[^/]+$/);
  assert.equal(id.source, 'skillsmp');
  assert.equal(/skillsmp/.test(id.repo_full_name), false);
});

test('TC-305 repoFromGithubUrl parses the real URL shapes SkillsMP returns', () => {
  assert.deepEqual(
    repoFromGithubUrl('https://github.com/openclaw/openclaw/tree/main/skills/nano-pdf'),
    { owner: 'openclaw', repo: 'openclaw', full_name: 'openclaw/openclaw', path: 'skills/nano-pdf' });
  assert.equal(repoFromGithubUrl('https://github.com/o/r').full_name, 'o/r');
  assert.equal(repoFromGithubUrl('https://gitlab.com/o/r'), null);
  assert.equal(repoFromGithubUrl(null), null);
});

test('TC-306 DEC-002 getContent returns NotAvailable: SkillsMP hosts no content', () => {
  const got = conn().getContent();
  assert.equal(got.status, 'NotAvailable');
  assert.match(got.reason, /does not host/);
});

test('TC-307 BRIEF §17 stars are surfaced as a signal, never as content or ranking', async () => {
  const c = conn();
  const { records } = await c.discover({ q: 'pdf' });
  const meta = c.getMetadata(records[0]);
  assert.ok('stars' in meta);
  assert.ok('skillsmp_url' in meta, 'the aggregator page is kept for attribution');
  assert.equal('content' in meta, false);
});

test('TC-308 REQ-085 the result discloses that a page is not a catalogue', async () => {
  const { disclosure, pagination } = await conn().discover({ q: 'pdf' });
  assert.equal(disclosure.enumerable, false);
  assert.match(disclosure.note, /cannot be enumerated/);
  // The live API states `total` may be a proven LOWER BOUND; that is carried through.
  assert.ok('totalIsExact' in pagination);
});

test('TC-309 REQ-004 a real API error is surfaced with its own code, not a generic failure', async () => {
  const c = conn({ fetchImpl: replay('missing_query') });
  // The recorded 400 from the live API: {"code":"MISSING_QUERY"}.
  await assert.rejects(() => c.discover({ q: 'anything' }), /MISSING_QUERY/);
});

test('TC-310 REQ-025 the circuit breaker opens on repeated failure and reports its state', () => {
  let now = 0;
  const b = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, clock: () => now });
  assert.equal(b.state, BREAKER_STATE.CLOSED);
  b.recordFailure(); b.recordFailure();
  assert.equal(b.isOpen(), false, 'below the threshold it stays closed');
  b.recordFailure();
  assert.equal(b.isOpen(), true, 'at the threshold it opens');
  assert.equal(b.report().failures, 3, 'REQ-025: it REPORTS, it does not only block');

  now += 1001;
  assert.equal(b.state, BREAKER_STATE.HALF_OPEN, 'one probe is allowed - a breaker that never retries is an outage');
  b.recordSuccess();
  assert.equal(b.state, BREAKER_STATE.CLOSED);
});

test('TC-311 REQ-025 an open breaker stops requests before they reach the source', async () => {
  let now = 0;
  const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10_000, clock: () => now });
  let calls = 0;
  const c = new SkillsMPConnector({
    circuitBreaker: breaker,
    fetchImpl: async () => { calls++; throw new Error('source down'); } });
  await assert.rejects(() => c.discover({ q: 'pdf' }), /source down/);
  assert.equal(calls, 1);
  await assert.rejects(() => c.discover({ q: 'pdf' }), /CIRCUIT_OPEN/);
  assert.equal(calls, 1, 'the second request never reached the source - which protects THEM too');
});

test('TC-312 REQ-096/NFR-037 robots is parsed, and API use is separable from crawling', async () => {
  const policy = new RobotsPolicy();
  // SkillsMP's actual robots.txt, verbatim.
  await policy.load('https://skillsmp.com', [
    'User-Agent: *', 'Allow: /', 'Allow: /api/llms.txt',
    'Disallow: /api/github-contents', 'Disallow: /api/', 'Disallow: /auth/',
    'Crawl-delay: 1'].join('\n'));

  assert.equal(policy.crawlDelay('https://skillsmp.com'), 1);
  const r = policy.report('https://skillsmp.com');
  assert.ok(r.disallow.includes('/api/'));

  // A CRAWLER is bound by the directive.
  assert.equal(policy.isAllowed('https://skillsmp.com/api/v1/skills/search?q=x',
                                { channel: 'crawl' }), false);
  // A documented API consumer is not a crawler (DEC-038), and the distinction is explicit
  // in code rather than assumed by whoever reads it next.
  assert.equal(policy.isAllowed('https://skillsmp.com/api/v1/skills/search?q=x',
                                { channel: 'api' }), true);
  // Ordinary pages are allowed either way.
  assert.equal(policy.isAllowed('https://skillsmp.com/about', { channel: 'crawl' }), true);
});

test('TC-313 REQ-028 a 304 skips the re-fetch and is counted', async () => {
  let served = 0;
  const fetcher = new ConditionalFetcher({
    fetchImpl: async (url, opts) => {
      served++;
      if (opts.headers['If-None-Match'] === '"v1"') {
        return { ok: false, status: 304, headers: new Map() };
      }
      return { ok: true, status: 200,
               headers: new Map([['etag', '"v1"']]),
               text: async () => 'body v1' };
    } });

  const first = await fetcher.fetchIfChanged('https://x/a');
  assert.equal(first.status, 'fetched');
  assert.equal(first.body, 'body v1');

  const second = await fetcher.fetchIfChanged('https://x/a');
  assert.equal(second.status, 'not-modified');
  assert.equal(second.unchanged, true);
  assert.equal(second.reason, 'source returned 304');
  assert.equal(served, 2, 'a conditional REQUEST was made - this is not a blind cache');
  assert.deepEqual(fetcher.stats, { requests: 2, notModified: 1, fetched: 1 });
});

test('TC-314 REQ-028 a known version ref settles "unchanged" without any request at all', async () => {
  let served = 0;
  const fetcher = new ConditionalFetcher({ fetchImpl: async () => { served++; return { ok: true, status: 200,
    headers: new Map(), text: async () => 'x' }; } });
  fetcher.remember('https://x/b', { versionRef: 'blobsha123' });
  const r = await fetcher.fetchIfChanged('https://x/b', { versionRef: 'blobsha123' });
  assert.equal(r.unchanged, true);
  assert.equal(r.reason, 'version ref unchanged');
  assert.equal(served, 0, 'the cheapest possible unchanged: no request at all');
  // A DIFFERENT ref does issue a request.
  const changed = await fetcher.fetchIfChanged('https://x/b', { versionRef: 'blobsha999' });
  assert.equal(changed.status, 'fetched');
  assert.equal(served, 1);
});
