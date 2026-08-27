/**
 * RAW storage stage. DES-017, DES-020, DES-021. REQ-029..REQ-034, REQ-098, DEC-019.
 *
 * Imports the ObjectStore PORT only. No filesystem, no bucket, no SDK: this module runs
 * unchanged against the fs, memory and R2 adapters (NFR-027, NFR-028).
 */
import { assertObjectStoreContract, assertRawPurpose, RAW_PURPOSE } from '../../ports/src/index.js';
import { contentHash, retentionFor, computeRights, RETENTION_POLICY } from '../../skill-core/src/index.js';

export { RAW_PURPOSE };

/** DEC-019 mapped to real durations. The POLICY is unchanged; only its clock is new. */
export const RETENTION_DAYS = Object.freeze({
  [RETENTION_POLICY.PROCESS_THEN_DELETE]: 0,   // eligible for deletion immediately
  [RETENTION_POLICY.SHORT]: 7,
  [RETENTION_POLICY.STANDARD]: 90,
});

export class RawUnavailableError extends Error {
  constructor(hash, state) {
    super(`RAW_UNAVAILABLE: no raw bytes for ${hash}${state ? ` (state: ${state})` : ''}. ` +
          'Reprocessing cannot proceed and the source is NOT re-fetched implicitly (DEC-019).');
    this.name = 'RawUnavailableError';
  }
}

export function expiryFor(policy, nowIso) {
  const days = RETENTION_DAYS[policy] ?? 0;
  return new Date(Date.parse(nowIso) + days * 86_400_000).toISOString();
}

/**
 * REQ-029: writes RAW **before any parsing**, addressed by content hash.
 * REQ-030: the object carries a self-describing sidecar so raw stays reprocessable even
 * if the relational store is lost; the pointer and retention state go to the database.
 *
 * Throws on failure. REQ-031 forbids proceeding into PARSED/CANONICAL with a raw
 * reference the system does not actually hold.
 */
export async function storeRaw({ objects, store, discovery, rawText, rights, now }) {
  assertObjectStoreContract(objects);
  if (typeof now !== 'string') throw new TypeError('storeRaw requires an explicit UTC timestamp (NFR-038)');

  const hash = contentHash(rawText);
  const policy = retentionFor(rights);
  const meta = {
    source: discovery.source,
    source_url: discovery.url,
    repo_full_name: discovery.repo_full_name,
    path: discovery.path,
    source_version_ref: discovery.version_ref ?? discovery.source_payload?.file_sha ?? null,
    retrieved_at: discovery.discovered_at ?? now,
    content_hash: hash,
    rights_state: rights.state,
    retention_policy: policy,
  };

  const put = await objects.put(hash, rawText, meta);

  store.upsertRawObject({
    contentHash: hash, objectKey: hash, sourceId: discovery.source,
    sourceUrl: discovery.url, sourceVersionRef: meta.source_version_ref,
    retrievedAt: meta.retrieved_at, sizeBytes: put.bytes,
    rightsState: rights.state, retentionPolicy: policy,
    expiresAt: expiryFor(policy, now), state: 'retained',
  });

  return { rawObjectKey: hash, contentHash: hash, bytes: put.bytes,
           alreadyExisted: put.alreadyExisted, retentionPolicy: policy };
}

/**
 * REQ-033: every raw read names its purpose. "Serve to a user" is not on the list and
 * cannot be added without editing the port and failing a test.
 */
export async function readRaw({ objects, store, contentHash: hash, purpose }) {
  assertRawPurpose(purpose);
  const record = store.getRawObject(hash);
  const obj = await objects.get(hash);
  if (!obj) throw new RawUnavailableError(hash, record?.state);
  return { bytes: obj.bytes, text: obj.bytes.toString('utf8'), meta: obj.meta, record };
}

/**
 * REQ-034 / DEC-019: deletes real bytes on expiry. The raw_objects row and any tombstone
 * survive - the envelope outlives the bytes (DEC-015).
 */
export async function applyRetention({ objects, store, now, limit = 500, reason = 'retention expiry' }) {
  assertObjectStoreContract(objects);
  const due = store.findExpiredRaw({ now, limit });
  let deleted = 0, alreadyGone = 0;
  for (const r of due) {
    const removed = await objects.delete(r.content_hash);
    removed ? deleted++ : alreadyGone++;
    store.markRawDeleted({ contentHash: r.content_hash, now, reason });
  }
  return { considered: due.length, deleted, alreadyGone, counts: store.rawCounts() };
}

/** Deletion driven by an author request rather than by the clock (REQ-063). */
export async function deleteRawFor({ objects, store, contentHash: hash, now, reason }) {
  assertObjectStoreContract(objects);
  const removed = await objects.delete(hash);
  store.markRawDeleted({ contentHash: hash, now, reason });
  return { deleted: removed };
}
