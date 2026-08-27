import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRouter, NOTICE } from '../src/router.js';
import { serialiseSkill } from '../src/serialise.js';
import { SqliteCanonicalStore, SCHEMA_VERSION } from '../../../packages/adapters/sqlite/src/index.js';
import { MemoryRateLimiter } from '../../../packages/adapters/memory-ratelimit/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         rebuildSearchIndex } from '../../../packages/ingestion/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const clock = () => NOW;

function rig({ skills = 3, limiter = null } = {}) {
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
                          repoLicence: i % 2 === 0 ? 'MIT' : null, now: d.discovered_at });
    resolveOccurrence({ store, discovery: d, canonical: c, fingerprints: fingerprint(raw), now: NOW });
    ids.push(c.id);
  }
  // DATABASE.md SS46: canonical is written, then the derived index is built. The rig
  // mirrors that sequence rather than relying on indexing happening as a side effect
  // of the canonical write - which is precisely the coupling we removed.
  rebuildSearchIndex({ store, now: NOW });
  return { store, ids, router: new ApiRouter({ store, clock, limiter }) };
}
const GET = (router, path, query = {}, clientId = 'test') =>
  router.handle({ method: 'GET', path, query, clientId });

test('TC-146 REQ-064 the API is versioned and reports health', () => {
  const { router, store } = rig();
  const r = GET(router, '/api/v1/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.schema_version, SCHEMA_VERSION, 'health reports the live schema version');
  store.close();
});

test('TC-147 REQ-065 a skill is returned with provenance, rights and attribution', () => {
  const { router, ids, store } = rig();
  const r = GET(router, `/api/v1/skills/${ids[0]}`);
  assert.equal(r.status, 200);
  const d = r.body.data;
  assert.ok(d.attribution.repository && d.attribution.owner && d.attribution.canonical_source_url);
  assert.ok(d.provenance.field_origins['declared.name']);
  assert.ok(['known', 'unknown'].includes(d.rights.state));
  store.close();
});

test('TC-148 REQ-070/DOM-006 facts and inferences are separate objects on the wire', () => {
  const { router, ids, store } = rig();
  const d = GET(router, `/api/v1/skills/${ids[0]}`).body.data;
  assert.ok('declared' in d && 'inferred' in d);
  assert.deepEqual(d.inferred, {}, 'empty in Phase 1, but the shape exists');
  assert.match(d.provenance.field_origins['rights.redistributable'], /^appmd_inference:/);
  assert.match(d.provenance.field_origins['declared.name'], /^source_fact:/);
  store.close();
});

test('TC-149 DEC-018 rights.state travels on the wire as an explicit value', () => {
  const { router, ids, store } = rig();
  const known = GET(router, `/api/v1/skills/${ids[0]}`).body.data;   // MIT
  const unknown = GET(router, `/api/v1/skills/${ids[1]}`).body.data; // no licence
  assert.equal(known.rights.state, 'known');
  assert.equal(unknown.rights.state, 'unknown');
  assert.equal(unknown.rights.redistributable, false);
  assert.match(unknown.rights.basis, /no recognised licence/);
  store.close();
});

test('TC-150 REQ-062/DEC-009 content is NEVER served, under any licence', () => {
  const { router, ids, store } = rig();
  for (const id of ids) {
    const d = GET(router, `/api/v1/skills/${id}`).body.data;
    assert.equal(d.content, null);
    assert.equal(d.content_available, false);
    assert.match(d.content_notice, /does not serve third-party skill content/);
    assert.equal(JSON.stringify(d).includes('Body 0.'), false, 'no body text anywhere in the payload');
  }
  store.close();
});

test('TC-151 REQ-061 every response carries the notice and attribution', () => {
  const { router, ids, store } = rig();
  const one = GET(router, `/api/v1/skills/${ids[0]}`).body;
  const many = GET(router, '/api/v1/skills').body;
  assert.equal(one.notice, NOTICE);
  assert.equal(many.notice, NOTICE);
  for (const s of many.data) assert.ok(s.attribution.canonical_source_url);
  store.close();
});

test('TC-152 REQ-061 the serialiser REFUSES a record without attribution', () => {
  // The last line of defence. A record without attribution should never have been
  // written (NFR-004 + the CHECK constraint), but if one existed, emitting it is the
  // worse failure: for most OSS licences, attribution failure IS the violation.
  const { store } = rig({ skills: 1 });
  const row = store.cursorScan().rows[0];
  for (const field of ['attribution_repository', 'attribution_owner', 'attribution_url']) {
    assert.throws(() => serialiseSkill({ ...row, [field]: '' }), /REQ-061/,
      `missing ${field} must be refused, not omitted`);
  }
  assert.doesNotThrow(() => serialiseSkill(row));
  store.close();
});

test('TC-162 REQ-061 a corrupt stored record produces a 500, never a silent omission', () => {
  const { store, ids } = rig({ skills: 1 });
  // Bypass every domain guard to simulate a record that got in some other way.
  const broken = { ...store.cursorScan().rows[0], attribution_url: '' };
  const router = new ApiRouter({
    store: { schemaVersion: () => 1, getCanonical: () => broken,
             cursorScan: () => ({ rows: [], cursor: { next: null, limit: 50 } }),
             listOccurrences: () => ({ rows: [], cursor: { next: null, limit: 50 } }) },
    clock, limiter: null });
  const r = router.handle({ method: 'GET', path: `/api/v1/skills/${ids[0]}`, query: {} });
  assert.equal(r.status, 500);
  assert.equal(r.body.error.code, 'ATTRIBUTION_MISSING');
  assert.match(r.body.error.message, /report it/);
  store.close();
});

test('TC-153 NFR-039 collections are cursor-paginated with an enforced maximum', () => {
  const { router, store } = rig({ skills: 25 });
  const seen = new Set();
  let cursor = null, pages = 0;
  do {
    const r = GET(router, '/api/v1/skills', { cursor, limit: 7 });
    r.body.data.forEach((s) => seen.add(s.id));
    cursor = r.body.cursor.next; pages++;
    assert.ok(pages < 20, 'pagination terminates');
  } while (cursor);
  assert.equal(seen.size, 25, 'every record exactly once');

  const capped = GET(router, '/api/v1/skills', { limit: 9999 });
  assert.equal(capped.body.cursor.limit, 100, 'page size is capped, not honoured blindly');
  store.close();
});

test('TC-154 REQ-067 occurrences are paginated and 404 for an unknown skill', () => {
  const { router, ids, store } = rig();
  const ok = GET(router, `/api/v1/skills/${ids[0]}/occurrences`);
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.data));
  assert.ok('cursor' in ok.body);
  const missing = GET(router, '/api/v1/skills/cs_nope/occurrences');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'SKILL_NOT_FOUND');
  store.close();
});

test('TC-155 REQ-068 a source is returned with its declared access policy', () => {
  const { router, store } = rig();
  const r = GET(router, '/api/v1/sources/gitskills');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.access_policy.max_concurrency, 1);
  assert.equal(GET(router, '/api/v1/sources/nope').status, 404);
  store.close();
});

test('TC-156 REQ-069 search requires a query and returns matches', () => {
  const { router, store } = rig({ skills: 5 });
  assert.equal(GET(router, '/api/v1/search').status, 400);
  assert.equal(GET(router, '/api/v1/search').body.error.code, 'MISSING_QUERY');
  const r = GET(router, '/api/v1/search', { q: 'skill-3' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].declared.name, 'skill-3');
  store.close();
});

test('TC-157 INVALID_CURSOR is a 400 with a recovery path, not a 500', () => {
  const { router, store } = rig();
  const r = GET(router, '/api/v1/skills', { cursor: 'garbage' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_CURSOR');
  assert.match(r.body.error.message, /Restart pagination/);
  store.close();
});

test('TC-158 REQ-097 rate limiting returns 429 with Retry-After', () => {
  let t = 0;
  const limiter = new MemoryRateLimiter({ budget: 3, windowMs: 60_000, clock: () => t });
  const { router, store } = rig({ limiter });
  for (let i = 0; i < 3; i++) assert.equal(GET(router, '/api/v1/health').status, 200);
  const blocked = GET(router, '/api/v1/health');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.headers['Retry-After']) > 0, 'Retry-After is stated, as we require of sources');
  t += 60_001;
  assert.equal(GET(router, '/api/v1/health').status, 200, 'the window rolls');
  store.close();
});

test('TC-159 REQ-097 rate limits are per client, not global', () => {
  const limiter = new MemoryRateLimiter({ budget: 2, windowMs: 60_000, clock: () => 0 });
  const { router, store } = rig({ limiter });
  GET(router, '/api/v1/health', {}, 'alice');
  GET(router, '/api/v1/health', {}, 'alice');
  assert.equal(GET(router, '/api/v1/health', {}, 'alice').status, 429);
  assert.equal(GET(router, '/api/v1/health', {}, 'bob').status, 200, 'bob is unaffected');
  store.close();
});

test('TC-160 the API is read-only: writes are refused', () => {
  const { router, store } = rig();
  const r = router.handle({ method: 'POST', path: '/api/v1/skills', query: {} });
  assert.equal(r.status, 405);
  assert.match(r.body.error.message, /read-only/);
  store.close();
});

test('TC-161 REQ-071 errors carry a stable code and a request id, and leak nothing', () => {
  const { router, store } = rig();
  const r = GET(router, '/api/v1/nonsense');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
  assert.match(r.body.error.request_id, /^req_/);
  assert.equal(JSON.stringify(r.body).includes('sqlite'), false);
  store.close();
});


test('TC-238 REQ-033 the API has no route to raw content and never returns raw bytes', () => {
  const { router, ids, store } = rig({ skills: 2 });
  // No raw route exists.
  for (const path of ['/api/v1/raw', `/api/v1/skills/${ids[0]}/raw`, '/api/v1/objects',
                      `/api/v1/raw/${ids[0]}`, '/api/v1/content']) {
    const r = GET(router, path);
    assert.equal(r.status, 404, `${path} must not exist`);
  }
  // And no response body carries raw bytes or an internal storage key.
  for (const path of [`/api/v1/skills/${ids[0]}`, '/api/v1/skills', '/api/v1/search?q=skill']) {
    const body = JSON.stringify(GET(router, path.split('?')[0], { q: 'skill' }).body);
    assert.equal(/"raw_object_key"/.test(body), false, `${path} leaks an internal storage key`);
    assert.equal(/sha256:[0-9a-f]{64}/.test(body.replace(/"(content|normalised)_hash":"sha256:[0-9a-f]{64}"/g, '')), false,
      `${path} leaks an object key outside the declared identity fields`);
    assert.equal(/Body \d/.test(body), false, `${path} leaks raw body text`);
  }
  store.close();
});
