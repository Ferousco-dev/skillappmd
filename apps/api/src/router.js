/**
 * Read-only API router. DES-050, DES-052, DES-054. REQ-064..REQ-071, REQ-097.
 * A pure function of (request) -> (response), so it is testable without a socket.
 */
import { serialiseSkill, serialiseOccurrence, envelope, errorBody, NOTICE } from './serialise.js';
import { cacheHeaders, matchesIfNoneMatch, NO_STORE, MAX_AGE_COLLECTION } from './cache-policy.js';

export const API_VERSION = 'v1';
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export class ApiRouter {
  #store; #clock; #limiter; #ids;

  constructor({ store, clock, limiter, requestId = defaultRequestId }) {
    if (!store || typeof clock !== 'function') {
      throw new TypeError('ApiRouter requires a CanonicalStore port and a clock (NFR-038)');
    }
    this.#store = store; this.#clock = clock; this.#limiter = limiter; this.#ids = requestId;
  }

  /** @param {{method:string,path:string,query?:object,clientId?:string}} req */
  handle(req) {
    const requestId = this.#ids();
    const generatedAt = this.#clock();
    const reply = (status, body, headers = {}) => ({ status, body, headers });

    // REQ-099 / CR-007. Every 200 goes through here so a new endpoint cannot be added
    // without a cache decision - omitting the call is a missing header, not a default.
    const cached = (body, kind, cacheableOverride) => {
      const headers = cacheHeaders(body, kind, cacheableOverride);
      if (matchesIfNoneMatch(req.headers?.['if-none-match'], headers.ETag)) {
        // 304 carries no body. Cache-Control must ride along or an intermediary may
        // re-derive freshness from nothing.
        return { status: 304, body: null, headers };
      }
      return reply(200, body, headers);
    };

    if (req.method !== 'GET') {
      return reply(405, errorBody('METHOD_NOT_ALLOWED',
        'The Phase 1 API is read-only. Ingestion is operator-driven via the CLI.', requestId), NO_STORE);
    }

    // REQ-097: rate limiting before any work is done.
    if (this.#limiter) {
      const gate = this.#limiter.acquire(req.clientId ?? 'anonymous');
      if (!gate.allowed) {
        return reply(429, errorBody('RATE_LIMITED',
          `Request budget exhausted. Retry after ${gate.retryAfterSeconds}s.`, requestId),
          { 'Retry-After': String(gate.retryAfterSeconds), ...NO_STORE });
      }
    }

    const path = req.path.replace(/\/+$/, '') || '/';
    const q = req.query ?? {};

    try {
      if (path === `/api/${API_VERSION}/health`) {
        // Health reports liveness. A cached health check is a lie about the present.
        return reply(200, { status: 'ok', schema_version: this.#store.schemaVersion(),
                            generated_at: generatedAt }, NO_STORE);
      }

      if (path === `/api/${API_VERSION}/skills`) {
        const limit = clampLimit(q.limit);
        const page = this.#store.cursorScan({ cursor: q.cursor ?? null, limit });
        return cached(envelope(page.rows.map(serialiseSkill),
          { requestId, generatedAt, cursor: page.cursor }), 'collection');
      }

      let m = path.match(new RegExp(`^/api/${API_VERSION}/skills/([^/]+)/occurrences$`));
      if (m) {
        const canonicalId = decodeURIComponent(m[1]);
        if (!this.#store.getCanonical(canonicalId)) return this.#notFound('skill', canonicalId, requestId);
        const limit = clampLimit(q.limit);
        const page = this.#store.listOccurrences({ canonicalId, cursor: q.cursor ?? null, limit });
        const body = envelope(page.rows.map(serialiseOccurrence),
          { requestId, generatedAt, cursor: page.cursor });
        // An occurrence carries no rights block of its own. It inherits the parent
        // record's decision rather than defaulting to cacheable - a location is still a
        // fact about work whose licence we may not know.
        const parentRights = JSON.parse(this.#store.getCanonical(canonicalId).rights_json);
        return cached(body, 'collection', parentRights?.cacheable === true);
      }

      m = path.match(new RegExp(`^/api/${API_VERSION}/skills/([^/]+)$`));
      if (m) {
        const row = this.#store.getCanonical(decodeURIComponent(m[1]));
        if (!row) return this.#notFound('skill', m[1], requestId);
        return cached(envelope(serialiseSkill(row), { requestId, generatedAt }), 'detail');
      }

      m = path.match(new RegExp(`^/api/${API_VERSION}/sources/([^/]+)$`));
      if (m) {
        const src = this.#store.getSource?.(decodeURIComponent(m[1]));
        if (!src) return this.#notFound('source', m[1], requestId);
        // A source record is AppMD's own configuration, not third-party work: no rights
        // block, so it cannot go through isCacheable(). It is safe to cache and short-lived.
        return reply(200, envelope({ id: src.id, access_policy: JSON.parse(src.access_policy),
                                     registered_at: src.registered_at }, { requestId, generatedAt }),
                     { 'Cache-Control': `public, max-age=${MAX_AGE_COLLECTION}, must-revalidate` });
      }

      if (path === `/api/${API_VERSION}/search`) {
        const term = String(q.q ?? '').trim();
        if (term === '') {
          return reply(400, errorBody('MISSING_QUERY', 'Parameter "q" is required.', requestId));
        }
        const limit = clampLimit(q.limit);
        const page = this.#store.search({ q: term, cursor: q.cursor ?? null, limit });
        return cached(envelope(page.rows.map(serialiseSkill),
          { requestId, generatedAt, cursor: page.cursor }), 'collection');
      }

      return reply(404, errorBody('NOT_FOUND', `No route for ${req.path}`, requestId));
    } catch (err) {
      if (/INVALID_CURSOR/.test(err.message)) {
        return reply(400, errorBody('INVALID_CURSOR',
          'Cursor malformed or expired. Restart pagination without a cursor.', requestId));
      }
      if (/REQ-061/.test(err.message)) {
        // A record without attribution must not be emitted. Failing the request is
        // the correct outcome; quietly omitting the field would be worse.
        return reply(500, errorBody('ATTRIBUTION_MISSING',
          'A stored record lacks attribution and cannot be served. This is a defect; report it.',
          requestId));
      }
      // REQ-071: never leak internals in a message.
      return reply(500, errorBody('INTERNAL_ERROR', 'An internal error occurred.', requestId));
    }
  }

  #notFound(kind, id, requestId) {
    return { status: 404, headers: {},
             body: errorBody(`${kind.toUpperCase()}_NOT_FOUND`, `No ${kind} with id "${id}".`, requestId) };
  }
}

function clampLimit(v) {
  const n = Number.parseInt(v ?? DEFAULT_LIMIT, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, n), MAX_LIMIT);   // NFR-039: enforced maximum page size
}

let counter = 0;
const defaultRequestId = () => `req_${(++counter).toString(36).padStart(6, '0')}`;
export { NOTICE };
