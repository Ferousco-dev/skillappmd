import { ApiError, request } from './client'
import { FIXTURES_ENABLED, fixtureGetSource } from './fixtures'
import type { Envelope, Source } from './types'

const settle = <T>(value: T): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), 320))

/** GET /api/v1/sources/:id (REQ-068) */
export async function getSource(id: string, signal?: AbortSignal): Promise<Envelope<Source>> {
  if (FIXTURES_ENABLED) {
    const envelope = fixtureGetSource(id)
    if (!envelope) {
      throw new ApiError({
        status: 404,
        code: 'SOURCE_NOT_FOUND',
        message: 'No source with that identifier is indexed.',
        requestId: 'fixture',
      })
    }
    return settle(envelope)
  }
  return request<Source>(`/sources/${encodeURIComponent(id)}`, { signal })
}
