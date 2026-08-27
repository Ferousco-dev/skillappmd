import type { ApiErrorBody, Envelope } from './types'

/**
 * Transport for the SkillAppMD read API (docs/API.md v1.0).
 *
 * Components never call fetch directly. Everything goes through here so that
 * envelope unwrapping, error normalisation and rate-limit handling exist in
 * exactly one place.
 *
 * The envelope is deliberately kept whole. `attribution` is mandatory on every
 * record (REQ-061, NFR-004) and must never be separable from the data it
 * describes, so this returns the envelope rather than just `data`.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1'

/** API.md §7. `code` is the stable contract; `message` is for humans. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  /** Seconds to wait, from Retry-After on a 429 (REQ-097). */
  readonly retryAfter: number | null

  constructor(init: {
    status: number
    code: string
    message: string
    requestId?: string | null
    retryAfter?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    this.retryAfter = init.retryAfter ?? null
  }

  /** Worth offering a retry button for. A 404 is not. */
  get isRetryable() {
    return this.status === 429 || this.status >= 500 || this.status === 0
  }

  get isRateLimited() {
    return this.status === 429
  }

  get isNotFound() {
    return this.status === 404
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds)
  // The header may also be an HTTP date.
  const date = Date.parse(header)
  if (Number.isNaN(date)) return null
  return Math.max(0, Math.round((date - Date.now()) / 1000))
}

export type RequestOptions = {
  signal?: AbortSignal
  /** Query parameters. Undefined and null values are dropped. */
  query?: Record<string, string | number | null | undefined>
}

function buildUrl(path: string, query: RequestOptions['query']) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  let response: Response

  try {
    response = await fetch(buildUrl(path, options.query), {
      signal: options.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (cause) {
    // Aborts are a caller decision, not a failure to report.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the API.',
    })
  }

  if (!response.ok) {
    let body: Partial<ApiErrorBody> = {}
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      // A 500 must never leak internals (API.md §7), so a non-JSON body is
      // expected in some failure modes and is not itself an error.
    }

    throw new ApiError({
      status: response.status,
      code: body.error?.code ?? `HTTP_${response.status}`,
      message: body.error?.message ?? 'The request failed.',
      requestId: body.error?.request_id ?? null,
      retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
    })
  }

  return (await response.json()) as Envelope<T>
}
