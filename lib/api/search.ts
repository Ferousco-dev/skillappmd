import { request } from './client'
import { FIXTURES_ENABLED, fixtureSearch } from './fixtures'
import type { Envelope, Skill } from './types'

const settle = <T>(value: T): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), 320))

/**
 * GET /api/v1/search?q= (REQ-069)
 *
 * Cursor paginated like every other collection whose size is not provably
 * bounded (NFR-039).
 */
export async function search(
  params: { q: string; cursor?: string | null; limit?: number },
  signal?: AbortSignal
): Promise<Envelope<Skill[]>> {
  if (FIXTURES_ENABLED) {
    return settle(fixtureSearch(params.q, params.cursor, params.limit ?? 8))
  }
  return request<Skill[]>('/search', {
    signal,
    query: { q: params.q, cursor: params.cursor, limit: params.limit },
  })
}
