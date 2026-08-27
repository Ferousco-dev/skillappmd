/**
 * In-memory ObjectStore adapter. Mirrors FsObjectStore's SEMANTICS with none of its
 * mechanism - no paths, no filesystem, no fan-out.
 *
 * It exists for the same reason MemoryCanonicalStore does (DEC-027, G4 §D): a second
 * adapter that shares nothing with the first except the port is the only way to prove
 * the port carries no implementation semantics. An S3-shaped adapter would share
 * key-and-bucket thinking with R2 and prove less.
 */
import { OBJECT_KEY_RE } from '../../../ports/src/index.js';
import { keyForBytes, ObjectKeyError } from '../../fs-objectstore/src/index.js';

export { keyForBytes };

export class MemoryObjectStore {
  #objects = new Map();   // key -> { bytes: Buffer, meta, deleted: bool }

  #assertKey(key) {
    if (typeof key !== 'string' || !OBJECT_KEY_RE.test(key)) {
      throw new ObjectKeyError(
        `invalid object key: ${JSON.stringify(String(key).slice(0, 60))} — ` +
        'keys must match sha256:<64 hex>. Source-derived names are never keys.');
    }
    return key;
  }

  async put(key, bytes, meta = {}) {
    const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
    const derived = keyForBytes(buf);
    if (key !== derived) {
      throw new ObjectKeyError(
        `key does not address its content: given ${key}, content hashes to ${derived}`);
    }
    this.#assertKey(key);
    const existing = this.#objects.get(key);
    if (existing && !existing.deleted) {
      if (!existing.bytes.equals(buf)) {
        throw new Error(`REQ-029 violated: ${key} already holds different bytes; raw is immutable`);
      }
      return { key, bytes: buf.length, created: false, alreadyExisted: true };
    }
    this.#objects.set(key, { bytes: buf, meta: { ...meta, key, size_bytes: buf.length }, deleted: false });
    return { key, bytes: buf.length, created: true, alreadyExisted: false };
  }

  async get(key) {
    this.#assertKey(key);
    const o = this.#objects.get(key);
    return o && !o.deleted ? { bytes: Buffer.from(o.bytes), meta: { ...o.meta } } : null;
  }

  async head(key) {
    this.#assertKey(key);
    const o = this.#objects.get(key);
    return o && !o.deleted ? { ...o.meta } : null;
  }

  async exists(key) {
    this.#assertKey(key);
    const o = this.#objects.get(key);
    return !!o && !o.deleted;
  }

  async delete(key) {
    this.#assertKey(key);
    const o = this.#objects.get(key);
    if (!o || o.deleted) return false;
    // The envelope survives the bytes (DEC-015).
    this.#objects.set(key, { bytes: Buffer.alloc(0), meta: { ...o.meta, bytes_deleted: true }, deleted: true });
    return true;
  }
}
