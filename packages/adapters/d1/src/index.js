/**
 * Cloudflare D1 CanonicalStore. CR-011, increment 14.
 *
 * There is almost nothing here, and that is the point. D1 speaks SQLite's dialect, so
 * every query, index and migration in `canonical-store.js` is already valid against it.
 * What differed was the call shape, and `D1Driver` absorbs that.
 *
 * `DEC-027` said the SQLite -> D1 move would be "a driver swap". `DEF-009` proved that
 * claim false at the time, because the port was synchronous. After `CR-008` it is true,
 * and this file is what "true" looks like: a composition, not a reimplementation.
 */
import { SqlCanonicalStore } from '../../sql-store/src/index.js';
import { D1Driver } from '../../sqlite/src/driver.js';

/** @param {D1Database} binding  env.DB from a Worker */
export function createD1CanonicalStore(binding) {
  return new SqlCanonicalStore(new D1Driver(binding));
}

export { D1Driver };
