import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, request } from '../client.ts'

const ENVELOPE = {
  data: { id: 's1', attribution: { repository: 'o/r', owner: 'o', canonical_source_url: 'https://github.com/o/r' }, declared: { name: 'a', description: 'b' }, inferred: {}, rights: { state: 'unknown', redistributable: false, basis: 'no licence detected' } },
  meta: { request_id: 'req-1', generated_at: '2026-08-27T13:45:00Z' },
  cursor: { next: null, limit: 50 },
  notice: 'Skills are indexed from public repositories.',
}

function stub(res: Partial<Response> & { json?: () => Promise<unknown> }) {
  ;(globalThis as any).fetch = async () => res as Response
}

test('returns the whole envelope, not just data', async () => {
  stub({ ok: true, status: 200, json: async () => ENVELOPE })
  const env = await request<any>('/skills/s1')
  assert.equal(env.data.id, 's1')
  assert.equal(env.data.attribution.owner, 'o', 'attribution rides on the record, never the envelope')
  assert.equal(env.cursor?.next, null)
  assert.equal(env.meta.request_id, 'req-1')
})

test('builds query strings and drops empty values', async () => {
  let seen = ''
  ;(globalThis as any).fetch = async (url: string) => {
    seen = url
    return { ok: true, status: 200, json: async () => ENVELOPE } as Response
  }
  await request('/skills', { query: { limit: 50, cursor: null, q: undefined, empty: '' } })
  assert.equal(seen, '/api/v1/skills?limit=50')
})

test('normalises an error body into ApiError with the contract code', async () => {
  stub({
    ok: false,
    status: 404,
    headers: new Headers(),
    json: async () => ({ error: { code: 'SKILL_NOT_FOUND', message: 'nope', request_id: 'req-9' } }),
  })
  const err = await request('/skills/none').catch(e => e)
  assert.ok(err instanceof ApiError)
  assert.equal(err.code, 'SKILL_NOT_FOUND')
  assert.equal(err.requestId, 'req-9')
  assert.equal(err.isNotFound, true)
  assert.equal(err.isRetryable, false, '404 must not offer retry')
})

test('parses Retry-After seconds on 429', async () => {
  stub({
    ok: false,
    status: 429,
    headers: new Headers({ 'Retry-After': '30' }),
    json: async () => ({ error: { code: 'RATE_LIMITED', message: 'slow down', request_id: 'r' } }),
  })
  const err = await request('/search').catch(e => e)
  assert.equal(err.retryAfter, 30)
  assert.equal(err.isRateLimited, true)
  assert.equal(err.isRetryable, true)
})

test('survives a non-JSON body, which a 500 may legitimately return', async () => {
  stub({
    ok: false,
    status: 500,
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError('not json')
    },
  })
  const err = await request('/skills').catch(e => e)
  assert.equal(err.code, 'HTTP_500')
  assert.equal(err.isRetryable, true)
})

test('network failure becomes NETWORK_ERROR, not an unhandled throw', async () => {
  ;(globalThis as any).fetch = async () => {
    throw new TypeError('failed to fetch')
  }
  const err = await request('/skills').catch(e => e)
  assert.equal(err.code, 'NETWORK_ERROR')
  assert.equal(err.status, 0)
})
