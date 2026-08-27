/**
 * HTTP cache directives and validators. REQ-099, NFR-040. CR-007.
 *
 * WHY THIS IS NOT A ONE-LINE HEADER. Two constraints already in the model decide the
 * policy, and both of them can only make it *stricter*:
 *
 *   1 DEC-018 - `unknown` rights are a state, not a false boolean. A record whose licence
 *     we cannot resolve must not be pushed into caches we do not control. 68.7% of real
 *     records resolve to unknown, so this is the common path, not the edge case.
 *   2 REQ-063 - removal must take effect. A cached representation outlives the origin
 *     delete by up to max-age, so max-age IS the removal propagation bound (NFR-040).
 *     That is why the TTL is small and deliberate rather than "an hour, why not".
 */

/** NFR-040: the removal propagation bound. Raising this weakens REQ-063. */
export const MAX_AGE_DETAIL = 300;
/** Collections change whenever any member changes, so they get the shorter life. */
export const MAX_AGE_COLLECTION = 60;

export const NO_STORE = Object.freeze({ 'Cache-Control': 'no-store' });

/**
 * REQ-099. A representation is publicly cacheable only if EVERY record in it says so.
 * One unknown-rights record in a page of 50 makes the whole page no-store - the page is
 * a single representation and cannot be partially evicted.
 */
export function isCacheable(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  if (rows.length === 0) return false;          // an empty page tells us nothing; do not cache it
  return rows.every((r) => r?.rights?.cacheable === true);
}

/**
 * Strong validator over the REPRESENTATION only.
 *
 * `meta.request_id` and `meta.generated_at` change on every single request. Including
 * them would produce a unique ETag per request, which is not a cache - it is a cache
 * that never hits. The validator therefore covers data, cursor and notice, and CR-007
 * records the consequence: a 304 lets a client keep the meta block it already had.
 */
export async function etagOf(body) {
  const stable = { data: body?.data ?? null, cursor: body?.cursor ?? null, notice: body?.notice ?? null };
  // Web Crypto, not node:crypto: this file runs on Workers, where node:crypto only
  // exists behind a compatibility flag. Async is the price and the router already is.
  const bytes = new TextEncoder().encode(JSON.stringify(stable));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"${hex.slice(0, 32)}"`;
}

/**
 * @param {object} body  the full response envelope
 * @param {'detail'|'collection'} kind
 * @param {boolean} [cacheableOverride]  for payloads that carry no rights block of their
 *   own (occurrences) and must inherit the parent record's decision.
 * @returns {object} headers
 */
export async function cacheHeaders(body, kind, cacheableOverride) {
  const etag = await etagOf(body);
  const cacheable = cacheableOverride === undefined ? isCacheable(body?.data) : cacheableOverride === true;
  if (!cacheable) {
    // Still return the validator: a client may revalidate even what an edge must not keep.
    return { ...NO_STORE, ETag: etag };
  }
  const maxAge = kind === 'detail' ? MAX_AGE_DETAIL : MAX_AGE_COLLECTION;
  return { 'Cache-Control': `public, max-age=${maxAge}, must-revalidate`, ETag: etag };
}

/** RFC 9110 If-None-Match. Weak comparison is correct here; we only ever mint strong tags. */
export function matchesIfNoneMatch(header, etag) {
  if (typeof header !== 'string' || header === '') return false;
  if (header.trim() === '*') return true;
  return header.split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .includes(etag);
}
