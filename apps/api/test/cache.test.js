/**
 * REQ-099 / NFR-040 - CR-007. Cache directives and conditional requests.
 *
 * The rig gives even-indexed records an MIT repository licence and odd-indexed ones no
 * licence at all, so `rights.cacheable` is true for the first and false for the second.
 * That mirrors the measured corpus, where 68.7% of records resolve to `unknown` - the
 * no-store path is the COMMON one and is tested as such.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouter } from '../src/router.js';
import { MAX_AGE_DETAIL, MAX_AGE_COLLECTION, etagOf } from '../src/cache-policy.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         rebuildSearchIndex } from '../../../packages/ingestion/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;

function rig({ skills = 3, licenceFor = (i) => (i % 2 === 0 ? 'MIT' : null), requestId } = {}) {
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  store.upsertSource({ id: 'gitskills', accessPolicy: { max_concurrency: 1, permitted_methods: ['local'] }, now: NOW });
  const ids = [];
  for (let i = 0; i < skills; i++) {
    const raw = `---\nname: skill-${i}\ndescription: Number ${i}.\n---\nBody ${i}.`;
    const d = { source: 'gitskills', external_id: `o/r${i}:SKILL.md`, repo_full_name: `o/r${i}`,
      path: 'SKILL.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/SKILL.md`,
      discovered_at: `2026-08-27T13:${String(i % 60).padStart(2, '0')}:00Z`, source_payload: {} };
    const c = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw,
                          repoLicence: licenceFor(i), now: d.discovered_at });
    resolveOccurrence({ store, discovery: d, canonical: c, fingerprints: fingerprint(raw), now: NOW });
    ids.push(c.id);
  }
  rebuildSearchIndex({ store, now: NOW });
  return { store, ids, router: new ApiRouter({ store, clock, ...(requestId ? { requestId } : {}) }) };
}
const GET = (router, path, { query = {}, headers } = {}) =>
  router.handle({ method: 'GET', path, query, headers, clientId: 'test' });

test('TC-319 REQ-099 a known-licence record is publicly cacheable and carries a validator', () => {
  const { router, ids, store } = rig();
  const r = GET(router, `/api/v1/skills/${ids[0]}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.rights.cacheable, true, 'precondition: this record has a known licence');
  assert.equal(r.headers['Cache-Control'], `public, max-age=${MAX_AGE_DETAIL}, must-revalidate`);
  assert.match(r.headers.ETag, /^"[0-9a-f]{32}"$/);
  store.close();
});

test('TC-320 REQ-099 an unknown-rights record is never pushed into a cache we do not control', () => {
  const { router, ids, store } = rig();
  const r = GET(router, `/api/v1/skills/${ids[1]}`);
  assert.equal(r.body.data.rights.state, 'unknown', 'precondition: no repository licence');
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.ok(r.headers.ETag, 'a validator is still offered so a client may revalidate');
  store.close();
});

test('TC-321 REQ-099 ONE unknown-rights record makes the whole page no-store', () => {
  const { router, store } = rig();   // mixed: MIT, null, MIT
  const r = GET(router, '/api/v1/skills');
  assert.ok(r.body.data.some((s) => s.rights.cacheable === true), 'page is genuinely mixed');
  assert.ok(r.body.data.some((s) => s.rights.cacheable === false), 'page is genuinely mixed');
  assert.equal(r.headers['Cache-Control'], 'no-store',
    'a page is one representation and cannot be partially evicted');
  store.close();
});

test('TC-322 REQ-099 a page whose records are all cacheable gets the collection lifetime', () => {
  const { router, store } = rig({ licenceFor: () => 'MIT' });
  const r = GET(router, '/api/v1/skills');
  assert.equal(r.headers['Cache-Control'], `public, max-age=${MAX_AGE_COLLECTION}, must-revalidate`);
  store.close();
});

test('TC-323 REQ-099 If-None-Match returns 304 with no body and keeps the freshness directive', () => {
  const { router, ids, store } = rig();
  const first = GET(router, `/api/v1/skills/${ids[0]}`);
  const second = GET(router, `/api/v1/skills/${ids[0]}`,
    { headers: { 'if-none-match': first.headers.ETag } });
  assert.equal(second.status, 304);
  assert.equal(second.body, null, '304 must not carry a body');
  assert.equal(second.headers['Cache-Control'], first.headers['Cache-Control'],
    'an intermediary must not have to re-derive freshness from nothing');
  store.close();
});

test('TC-324 NFR-040 the validator ignores per-request meta, or the cache could never hit', () => {
  // This is the test that proves the cache WORKS. request_id and generated_at change on
  // every request; if they reached the ETag, every response would be unique and the
  // header would be decoration.
  let n = 0;
  const { router, ids, store } = rig({ requestId: () => `req-${++n}` });
  const a = GET(router, `/api/v1/skills/${ids[0]}`);
  const b = GET(router, `/api/v1/skills/${ids[0]}`);
  assert.notEqual(a.body.meta.request_id, b.body.meta.request_id, 'the ids really do differ');
  assert.equal(a.headers.ETag, b.headers.ETag, 'yet the representation is the same');
  store.close();
});

test('TC-325 REQ-099 the validator is derived from the representation, not the route', () => {
  const { router, ids, store } = rig();
  const a = GET(router, `/api/v1/skills/${ids[0]}`);
  const b = GET(router, `/api/v1/skills/${ids[2]}`);
  assert.notEqual(a.headers.ETag, b.headers.ETag, 'different records must not share a validator');
  store.close();
});

test('TC-326 REQ-099 health and error responses are no-store', () => {
  const { router, store } = rig();
  assert.equal(GET(router, '/api/v1/health').headers['Cache-Control'], 'no-store',
    'a cached health check is a lie about the present');
  const notAllowed = router.handle({ method: 'POST', path: '/api/v1/skills', query: {} });
  assert.equal(notAllowed.headers['Cache-Control'], 'no-store');
  store.close();
});

test('TC-327 REQ-099 occurrences inherit the parent record rights, they do not default to cacheable', () => {
  const { router, ids, store } = rig();
  const known = GET(router, `/api/v1/skills/${ids[0]}/occurrences`);
  const unknown = GET(router, `/api/v1/skills/${ids[1]}/occurrences`);
  assert.match(known.headers['Cache-Control'], /^public, max-age=/);
  assert.equal(unknown.headers['Cache-Control'], 'no-store',
    'a location is still a fact about work whose licence we do not know');
  store.close();
});

test('TC-328 REQ-099 an empty page is not cached', () => {
  const { router, store } = rig({ skills: 0 });
  const r = GET(router, '/api/v1/skills');
  assert.deepEqual(r.body.data, []);
  assert.equal(r.headers['Cache-Control'], 'no-store', 'an empty page asserts nothing worth keeping');
  store.close();
});

test('TC-329 NFR-040 the detail lifetime is bounded by the removal propagation window', () => {
  // REQ-063 removal takes effect at the origin immediately; a cached copy survives up to
  // max-age. If this constant grows, removal silently gets slower - so the bound is a test.
  assert.ok(MAX_AGE_DETAIL <= 300, 'REQ-063 removal must propagate within 300s');
  assert.ok(MAX_AGE_COLLECTION <= MAX_AGE_DETAIL);
  assert.equal(typeof etagOf({ data: null }), 'string');
});
