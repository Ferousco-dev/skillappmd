/**
 * Circuit breaker. DES-016. REQ-025.
 *
 * Protects the SOURCE as much as us: hammering a failing service is rude as well as
 * futile, and every retry is a billable queue operation on our side (DATABASE.md §4.1).
 */
export const BREAKER_STATE = Object.freeze({ CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' });

export class CircuitBreaker {
  #threshold; #cooldownMs; #clock;
  #failures = 0; #openedAt = null; #state = BREAKER_STATE.CLOSED;

  constructor({ threshold = 5, cooldownMs = 60_000, clock = () => Date.now() } = {}) {
    this.#threshold = threshold; this.#cooldownMs = cooldownMs; this.#clock = clock;
  }

  get state() {
    if (this.#state === BREAKER_STATE.OPEN && this.#clock() - this.#openedAt >= this.#cooldownMs) {
      // One probe is allowed through: a breaker that never retries is just an outage.
      this.#state = BREAKER_STATE.HALF_OPEN;
    }
    return this.#state;
  }

  isOpen() { return this.state === BREAKER_STATE.OPEN; }

  recordFailure() {
    this.#failures++;
    if (this.#state === BREAKER_STATE.HALF_OPEN || this.#failures >= this.#threshold) {
      this.#state = BREAKER_STATE.OPEN;
      this.#openedAt = this.#clock();
    }
  }

  recordSuccess() { this.#failures = 0; this.#state = BREAKER_STATE.CLOSED; this.#openedAt = null; }

  /** REQ-025 requires the breaker to REPORT, not merely to block. */
  report() {
    return { state: this.state, failures: this.#failures, openedAt: this.#openedAt,
             cooldownMs: this.#cooldownMs, threshold: this.#threshold };
  }
}
