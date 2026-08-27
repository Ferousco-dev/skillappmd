import { ApiError, request } from './client'
import {
  FIXTURES_ENABLED,
  fixtureGetSkill,
  fixtureListSkills,
  fixtureOccurrences,
} from './fixtures'
import type { Envelope, Occurrence, Skill } from './types'

/**
 * Fixture short-circuits live in these modules, never inside client.ts, so the
 * transport stays a truthful description of the real API. Each is a single
 * guard to delete when the endpoint lands.
 */

/** Simulated latency, so loading states are actually visible in development. */
const settle = <T>(value: T): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), 320))

/** GET /api/v1/skills/:id (REQ-065) */
export async function getSkill(id: string, signal?: AbortSignal): Promise<Envelope<Skill>> {
  if (FIXTURES_ENABLED) {
    const envelope = fixtureGetSkill(id)
    if (!envelope) {
      throw new ApiError({
        status: 404,
        code: 'SKILL_NOT_FOUND',
        message: 'No skill with that identifier is indexed.',
        requestId: 'fixture',
      })
    }
    return settle(envelope)
  }
  return request<Skill>(`/skills/${encodeURIComponent(id)}`, { signal })
}

/**
 * GET /api/v1/skills (REQ-066)
 *
 * Cursor paginated. `cursor` is the opaque `cursor.next` from the previous
 * response; omit it for the first page. There is no offset parameter, because
 * offset pagination is forbidden by NFR-032.
 */
export async function listSkills(
  params: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal
): Promise<Envelope<Skill[]>> {
  if (FIXTURES_ENABLED) {
    return settle(fixtureListSkills(params.cursor, params.limit ?? 8))
  }
  return request<Skill[]>('/skills', {
    signal,
    query: { cursor: params.cursor, limit: params.limit },
  })
}

/**
 * GET /api/v1/skills/:id/occurrences (REQ-067)
 *
 * Paginated because a widely copied skill has many occurrences: measured
 * duplicate share is ~49.8% (R3).
 */
export async function listOccurrences(
  id: string,
  params: { cursor?: string | null; limit?: number } = {},
  signal?: AbortSignal
): Promise<Envelope<Occurrence[]>> {
  if (FIXTURES_ENABLED) {
    return settle(fixtureOccurrences(id, params.cursor, params.limit ?? 10))
  }
  return request<Occurrence[]>(`/skills/${encodeURIComponent(id)}/occurrences`, {
    signal,
    query: { cursor: params.cursor, limit: params.limit },
  })
}
