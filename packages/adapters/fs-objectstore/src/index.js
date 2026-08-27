/**
 * Filesystem ObjectStore adapter. DES-018. REQ-029, REQ-030, REQ-033, NFR-021.
 *
 * The ONLY place in the backend where a raw-content path is built. `node:fs` appears
 * here and nowhere above the port.
 *
 * Layout, content-addressed and deterministic (REQ-029, DOM-010):
 *
 *   sha256:abcd...  ->  <root>/sha256/ab/cd/abcd....raw
 *                       <root>/sha256/ab/cd/abcd....meta.json
 *
 * Two-level fan-out keeps directory sizes sane at corpus scale; the prefix is the same
 * idea as NFR-033's partition key. The key is NEVER a repository name, a URL, a path,
 * or any other mutable attribute - those are source-derived and therefore untrusted
 * (DEF-004's rule, generalised).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { OBJECT_KEY_RE } from '../../../ports/src/index.js';

export class ObjectKeyError extends Error {
  constructor(msg) { super(msg); this.name = 'ObjectKeyError'; }
}

/** REQ-029: the canonical key for a byte sequence. Deterministic and total. */
export function keyForBytes(bytes) {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
  return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

export class FsObjectStore {
  #root;

  constructor({ root }) {
    if (!root) throw new Error('FsObjectStore requires a root directory');
    this.#root = resolve(root);
    mkdirSync(this.#root, { recursive: true });
  }

  get root() { return this.#root; }

  /**
   * NFR-021, two INDEPENDENT defences:
   *   1. a whitelist - the key must match OBJECT_KEY_RE exactly, so no separator,
   *      dot segment, drive letter or control character can be present at all;
   *   2. a containment assertion on the RESOLVED path.
   * Either alone would probably do. Both are cheap, and the cost of being wrong here
   * is arbitrary filesystem access driven by third-party data.
   */
  #paths(key) {
    if (typeof key !== 'string' || !OBJECT_KEY_RE.test(key)) {
      throw new ObjectKeyError(
        `invalid object key: ${JSON.stringify(String(key).slice(0, 60))} — ` +
        'keys must match sha256:<64 hex>. Source-derived names are never keys.');
    }
    const hex = key.slice('sha256:'.length);
    const dir = join(this.#root, 'sha256', hex.slice(0, 2), hex.slice(2, 4));
    const base = join(dir, hex);
    const resolved = resolve(base);
    if (resolved !== base || !resolved.startsWith(this.#root + sep)) {
      throw new ObjectKeyError('object key resolves outside the configured root');
    }
    return { dir, raw: `${base}.raw`, meta: `${base}.meta.json` };
  }

  /**
   * REQ-029 immutability, enforced at the boundary. A differing byte sequence under an
   * existing key throws; identical bytes are a no-op success, so ingestion is idempotent
   * (REQ-016) without special-casing.
   */
  async put(key, bytes, meta = {}) {
    const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
    const derived = keyForBytes(buf);
    if (key !== derived) {
      throw new ObjectKeyError(
        `key does not address its content: given ${key}, content hashes to ${derived}`);
    }
    const p = this.#paths(key);
    if (existsSync(p.raw)) {
      const existing = readFileSync(p.raw);
      if (!existing.equals(buf)) {
        throw new Error(`REQ-029 violated: ${key} already holds different bytes; raw is immutable`);
      }
      return { key, bytes: buf.length, created: false, alreadyExisted: true };
    }
    mkdirSync(p.dir, { recursive: true });
    // REQ-030: the object is SELF-DESCRIBING, so raw remains reprocessable even if the
    // relational store is lost. This is the layer BRIEF §10 depends on.
    writeFileSync(p.meta, JSON.stringify({ ...meta, key, size_bytes: buf.length }, null, 2));
    writeFileSync(p.raw, buf);
    return { key, bytes: buf.length, created: true, alreadyExisted: false };
  }

  async get(key) {
    const p = this.#paths(key);
    if (!existsSync(p.raw)) return null;
    return { bytes: readFileSync(p.raw),
             meta: existsSync(p.meta) ? JSON.parse(readFileSync(p.meta, 'utf8')) : {} };
  }

  async head(key) {
    const p = this.#paths(key);
    if (!existsSync(p.raw)) return null;
    const meta = existsSync(p.meta) ? JSON.parse(readFileSync(p.meta, 'utf8')) : {};
    return { ...meta, key, size_bytes: statSync(p.raw).size };
  }

  async exists(key) { return existsSync(this.#paths(key).raw); }

  /**
   * DEC-015: deletes the BYTES. The metadata sidecar is retained as the object-store
   * half of the provenance envelope, so a deleted object is still describable.
   */
  async delete(key) {
    const p = this.#paths(key);
    if (!existsSync(p.raw)) return false;
    rmSync(p.raw, { force: true });
    if (existsSync(p.meta)) {
      const meta = JSON.parse(readFileSync(p.meta, 'utf8'));
      writeFileSync(p.meta, JSON.stringify({ ...meta, bytes_deleted: true }, null, 2));
    }
    return true;
  }
}
