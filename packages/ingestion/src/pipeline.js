/**
 * The RAW -> PARSED -> CANONICAL pipeline. DES-020, DES-025, DES-027.
 * REQ-029, REQ-031, REQ-032.
 *
 * Before increment 11 the stages existed but nothing composed them through RAW, so raw
 * bytes were never written. This module is that composition, and it is the ONLY path
 * that should be used to ingest a record.
 */
import { parseSkill } from './parser.js';
import { normalise } from './normaliser.js';
import { fingerprint, resolveOccurrence } from './deduplicator.js';
import { storeRaw, readRaw, RAW_PURPOSE } from './raw.js';
import { computeRights, retentionFor } from '../../skill-core/src/index.js';

/**
 * SOURCE -> RAW -> PARSED -> CANONICAL.
 *
 * REQ-029: raw is written BEFORE parsing.
 * REQ-031: if raw persistence is required and fails, this THROWS. It does not produce a
 *   canonical record carrying a raw reference the system does not hold.
 */
export async function ingestRecord({ store, objects, discovery, rawText, repoLicence = null, now,
                                    indexOnWrite = false }) {
  if (typeof now !== 'string') throw new TypeError('ingestRecord requires an explicit UTC timestamp (NFR-038)');
  if (!objects) throw new Error('REQ-029 violated: ingestion requires an ObjectStore; raw is written before parsing');

  // Rights first, because retention policy is an input to raw storage (DEC-019).
  const rights = computeRights({
    l1: { spdx: 'CC-BY-4.0', evidence: `dataset:${discovery.source}` },
    l2: repoLicence ? { spdx: repoLicence, evidence: 'repos.license' } : null,
  }, { now });

  // ---- RAW ---------------------------------------------------------------
  const raw = await storeRaw({ objects, store, discovery, rawText, rights, now });

  // ---- PARSED ------------------------------------------------------------
  const parsed = parseSkill(rawText);

  // ---- CANONICAL ---------------------------------------------------------
  const canonical = normalise({ discovery, parsed, rawText, repoLicence, now });
  const res = resolveOccurrence({
    store, discovery, canonical, fingerprints: fingerprint(rawText), now,
    rawObjectKey: raw.rawObjectKey,
  });

  // Eventual consistency by default (DATABASE.md SS46). Callers that want search to be
  // correct immediately - an interactive tool, a test - opt in and pay the memory.
  if (indexOnWrite && typeof store.indexCanonical === 'function') {
    indexOne(store, canonical, res.canonicalId, now);
  }

  return { ...res, rawObjectKey: raw.rawObjectKey, retentionPolicy: raw.retentionPolicy,
           parsed, canonical };
}

/**
 * REQ-032: RAW -> PARSED -> CANONICAL with NO source contact.
 *
 * The connector is not a parameter here, and that is the design: this function has no
 * way to reach a source even if it wanted to. Everything it needs comes from the object
 * store and the canonical store.
 */
/** One place that knows how a canonical record becomes an index entry. */
export function indexOne(store, canonical, canonicalId, now) {
  const name = canonical.declared?.name ?? null;
  const description = canonical.declared?.description ?? null;
  store.indexCanonical({
    canonicalId,
    haystack: `${name ?? ''} ${description ?? ''}`.toLowerCase().trim(),
    declaredName: name,
    createdAt: canonical.now ?? now,
    now,
  });
}

export async function reprocessFromRaw({ store, objects, contentHash, repoLicence = null, now,
                                         purpose = RAW_PURPOSE.REPROCESS }) {
  if (typeof now !== 'string') throw new TypeError('reprocessFromRaw requires an explicit UTC timestamp (NFR-038)');
  const raw = await readRaw({ objects, store, contentHash, purpose });   // throws RAW_UNAVAILABLE

  // The discovery record is RECONSTRUCTED from the raw object's own metadata, which is
  // why REQ-030 requires the object to be self-describing.
  const discovery = {
    source: raw.meta.source,
    external_id: `${raw.meta.repo_full_name}:${raw.meta.path}`,
    repo_full_name: raw.meta.repo_full_name,
    path: raw.meta.path,
    author: String(raw.meta.repo_full_name).split('/')[0],
    url: raw.meta.source_url,
    version_ref: raw.meta.source_version_ref,
    discovered_at: raw.meta.retrieved_at,
    channel: 'raw-replay',
    source_payload: { file_sha: raw.meta.source_version_ref },
  };

  const parsed = parseSkill(raw.text);
  const canonical = normalise({ discovery, parsed, rawText: raw.text, repoLicence, now });
  const res = resolveOccurrence({
    store, discovery, canonical, fingerprints: fingerprint(raw.text), now,
    rawObjectKey: contentHash,
  });
  return { ...res, reprocessed: true, fromRaw: true, parsed, canonical };
}
