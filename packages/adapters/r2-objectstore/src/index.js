/**
 * R2 ObjectStore BOUNDARY. DES-019. DEC-010, DATABASE.md §7.
 *
 * This is a boundary, not a live integration, and the distinction is deliberate:
 * Phase 1 has no paid Cloudflare plan (DEC-010), so a live R2 path cannot be verified
 * here. Shipping an unverifiable integration and calling it done would be exactly the
 * kind of claim Article 2 forbids.
 *
 * What IS implemented and testable offline: key derivation, key validation, and the
 * contract shape. What is NOT: any byte crossing the network. Those methods raise a
 * clear, actionable error rather than silently succeeding or silently no-oping.
 *
 * NO Cloudflare SDK is imported. In a Worker the binding arrives via `env.RAW_BUCKET`
 * and is injected; the adapter never reaches for a global, so it stays replaceable and
 * the dependency footprint stays at zero (DEC-030).
 */
import { OBJECT_KEY_RE } from '../../../ports/src/index.js';
import { keyForBytes, ObjectKeyError } from '../../fs-objectstore/src/index.js';

export { keyForBytes };

export class R2NotConfiguredError extends Error {
  constructor(op) {
    super(`R2 ObjectStore: "${op}" requires external infrastructure (an R2 bucket binding). ` +
          'Phase 1 runs locally (DEC-010); this boundary is not live-verified.');
    this.name = 'R2NotConfiguredError';
  }
}

export class R2ObjectStore {
  #bucket; #prefix;

  /** @param bucket an injected R2 bucket binding, or null for the unconfigured boundary. */
  constructor({ bucket = null, prefix = 'raw' } = {}) {
    this.#bucket = bucket; this.#prefix = prefix;
  }

  get isLive() { return this.#bucket !== null; }

  /** Offline-testable: the same validation and derivation as every other adapter. */
  objectPath(key) {
    if (typeof key !== 'string' || !OBJECT_KEY_RE.test(key)) {
      throw new ObjectKeyError(
        `invalid object key: ${JSON.stringify(String(key).slice(0, 60))} — ` +
        'keys must match sha256:<64 hex>. Source-derived names are never keys.');
    }
    const hex = key.slice('sha256:'.length);
    return `${this.#prefix}/sha256/${hex.slice(0, 2)}/${hex.slice(2, 4)}/${hex}`;
  }

  async put(key, bytes, meta = {}) {
    const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
    if (key !== keyForBytes(buf)) {
      throw new ObjectKeyError(`key does not address its content: given ${key}`);
    }
    const path = this.objectPath(key);
    if (!this.#bucket) throw new R2NotConfiguredError('put');
    // R2 has no native immutability, so the check is explicit here too (REQ-029).
    const existing = await this.#bucket.head(path);
    if (existing) return { key, bytes: buf.length, created: false, alreadyExisted: true };
    await this.#bucket.put(path, buf, { customMetadata: { ...meta, key } });
    return { key, bytes: buf.length, created: true, alreadyExisted: false };
  }

  async get(key) {
    const path = this.objectPath(key);
    if (!this.#bucket) throw new R2NotConfiguredError('get');
    const o = await this.#bucket.get(path);
    return o ? { bytes: Buffer.from(await o.arrayBuffer()), meta: o.customMetadata ?? {} } : null;
  }

  async head(key) {
    const path = this.objectPath(key);
    if (!this.#bucket) throw new R2NotConfiguredError('head');
    const o = await this.#bucket.head(path);
    return o ? { ...(o.customMetadata ?? {}), key, size_bytes: o.size } : null;
  }

  async exists(key) { return (await this.head(key)) !== null; }

  async delete(key) {
    const path = this.objectPath(key);
    if (!this.#bucket) throw new R2NotConfiguredError('delete');
    const existing = await this.#bucket.head(path);
    if (!existing) return false;
    await this.#bucket.delete(path);
    return true;
  }
}
