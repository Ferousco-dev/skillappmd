/**
 * CR-011. The Worker entry point.
 *
 * Everything below this file is already covered by the API and store suites. What is
 * tested here is what only exists at the edge: origin allow-listing, the missing-binding
 * failure, error containment, and the 304 body rule — plus the fact that a stray export
 * stops the Worker starting, which cost a debugging cycle and no bundler warning.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker from '../src/index.js';
import { FakeD1Database } from '../../../packages/adapters/d1/src/fake-d1.js';
import { createD1CanonicalStore } from '../../../packages/adapters/d1/src/index.js';

const ORIGINS = 'https://skill.appmd.dev,http://localhost:3000';
async function env() {
  const DB = new FakeD1Database();
  await createD1CanonicalStore(DB).migrate({ now: '2026-08-27T13:45:00Z' });
  return { DB, ALLOWED_ORIGINS: ORIGINS };
}
const GET = (path, headers = {}) => new Request(`https://api.test${path}`, { method: 'GET', headers });

test('TC-345 REQ-106/REQ-107 the Worker serves the API over HTTP against a D1 binding', async () => {
  const res = await worker.fetch(GET('/api/v1/health'), await env());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /application\/json/);
  assert.equal((await res.json()).schema_version, 3);
});

test('TC-346 REQ-109 a missing D1 binding fails loudly at the edge, not per query', async () => {
  // A binding typo in wrangler.toml yields undefined. Without this the first symptom is
  // a null-property error inside a request, which names nothing useful.
  const res = await worker.fetch(GET('/api/v1/health'), { ALLOWED_ORIGINS: ORIGINS });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'NOT_CONFIGURED');
});

test('TC-347 REQ-108 CORS is allow-listed, never a wildcard', async () => {
  const e = await env();
  const allowed = await worker.fetch(GET('/api/v1/health', { Origin: 'http://localhost:3000' }), e);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');

  const denied = await worker.fetch(GET('/api/v1/health', { Origin: 'https://evil.example' }), e);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null,
    'an unlisted origin must not be echoed back — a wildcard lets any site spend the request budget');

  const preflight = await worker.fetch(
    new Request('https://api.test/api/v1/skills', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } }), e);
  assert.equal(preflight.status, 204);
});

test('TC-348 CR-011/REQ-099 a 304 carries no body through the HTTP layer', async () => {
  const e = await env();
  const first = await worker.fetch(GET('/api/v1/skills'), e);
  const etag = first.headers.get('ETag');
  assert.ok(etag);

  const second = await worker.fetch(GET('/api/v1/skills', { 'If-None-Match': etag }), e);
  assert.equal(second.status, 304);
  assert.equal(await second.text(), '', 'RFC 9110: a 304 response must not carry a body');
  assert.ok(second.headers.get('Cache-Control'));
});

test('TC-349 REQ-071/REQ-109 an unexpected failure returns a generic error, never internals', async () => {
  const broken = { DB: { prepare() { throw new Error('SECRET connection string leaked here'); } },
                   ALLOWED_ORIGINS: ORIGINS };
  const res = await worker.fetch(GET('/api/v1/health'), broken);
  assert.equal(res.status, 500);
  const body = await res.text();
  assert.match(body, /INTERNAL_ERROR/);
  assert.doesNotMatch(body, /SECRET|connection string/, 'REQ-071: internals must never reach a caller');
});

test('TC-350 REQ-107 the Worker module exports ONLY a default handler', () => {
  // workerd treats every module export as an entrypoint and refuses a non-handler value,
  // so `export { API_VERSION }` stopped the Worker STARTING. `wrangler deploy --dry-run`
  // bundles it happily and says nothing; only booting the runtime surfaced it.
  const src = readFileSync(resolve(import.meta.dirname, '../src/index.js'), 'utf8');
  const exports = src.match(/^export\s+(?!default)/gm) ?? [];
  assert.deepEqual(exports, [], 'a non-handler export prevents the Worker from starting');
});

test('TC-351 CR-011 wrangler.toml contains no secret', () => {
  // The file is committed. CR-010's Gemini key and anything else sensitive are Workers
  // secrets set by the operator, never written here.
  const toml = readFileSync(resolve(import.meta.dirname, '../../../wrangler.toml'), 'utf8');
  // Comments are stripped first: the file explains WHY it holds no secret, and matching
  // that prose would make this test fire on its own documentation.
  const settings = toml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(settings, /api[_-]?key\s*=|secret\s*=|token\s*=|GEMINI/i);
});
