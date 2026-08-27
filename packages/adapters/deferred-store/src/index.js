/**
 * A CanonicalStore whose every method resolves on a LATER turn of the event loop.
 *
 * WHY THIS EXISTS. `DEF-009`: the port was declared portable on the evidence of two
 * adapters that were both synchronous — `node:sqlite` and a `Map`. Two implementations
 * agreeing proves less than it looks like when they were chosen for similarity. D1 and
 * every PostgreSQL driver are asynchronous, and the port could not accept either.
 *
 * `CR-008` made the port async. This adapter is what stops that fix from being cosmetic:
 * it is **deliberately impossible to satisfy with synchronous code**. A caller that
 * forgets an `await` gets a Promise where it expected a row, and the contract suite says
 * so — before a D1 binding exists to say it in production.
 *
 * It is a test double, not a storage engine, and it is not on any production path.
 */
import { MemoryCanonicalStore } from '../../memory-store/src/index.js';

/** A full macrotask, not `Promise.resolve()` — a microtask can hide an ordering bug. */
const defer = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 0));

export class DeferredMemoryCanonicalStore {
  #inner;

  constructor() {
    this.#inner = new MemoryCanonicalStore();
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop === 'close') return () => this.#inner.close?.();
        if (prop in target && typeof Reflect.get(target, prop, receiver) !== 'undefined') {
          return Reflect.get(target, prop, receiver);
        }
        const inner = this.#inner[prop];
        if (typeof inner !== 'function') return inner;
        return async (...args) => defer(await inner.apply(this.#inner, args));
      },
    });
  }
}
