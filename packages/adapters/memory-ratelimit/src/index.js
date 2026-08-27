/**
 * In-process RateLimiter adapter. DES-053. REQ-097.
 *
 * Phase 1 requires exactly one implementation: a configurable request budget per
 * client identifier over a configurable window, returning 429 with Retry-After.
 * Distributed/shared-state limiting is future work (DEC-021) - and the port exists
 * so adding it later is an adapter, not a rewrite.
 */
export class MemoryRateLimiter {
  #budget; #windowMs; #clock; #hits = new Map();

  constructor({ budget = 60, windowMs = 60_000, clock = () => Date.now() } = {}) {
    if (!Number.isInteger(budget) || budget < 1) throw new RangeError('budget must be a positive integer');
    this.#budget = budget; this.#windowMs = windowMs; this.#clock = clock;
  }

  /** @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number|null}} */
  acquire(clientId = 'anonymous') {
    const now = this.#clock();
    const cutoff = now - this.#windowMs;
    const hits = (this.#hits.get(clientId) ?? []).filter((t) => t > cutoff);

    if (hits.length >= this.#budget) {
      const retryAfter = Math.max(1, Math.ceil((hits[0] + this.#windowMs - now) / 1000));
      this.#hits.set(clientId, hits);
      return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
    }
    hits.push(now);
    this.#hits.set(clientId, hits);
    return { allowed: true, remaining: this.#budget - hits.length, retryAfterSeconds: null };
  }

  status(clientId = 'anonymous') {
    const cutoff = this.#clock() - this.#windowMs;
    const used = (this.#hits.get(clientId) ?? []).filter((t) => t > cutoff).length;
    return { budget: this.#budget, used, remaining: Math.max(0, this.#budget - used) };
  }

  release() { /* no-op: this limiter is time-windowed, not concurrency-based */ }
}
