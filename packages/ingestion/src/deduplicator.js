/**
 * Deduplication stage. DES-026, DES-027, DES-028.
 * REQ-042..REQ-048, DOM-001..DOM-005, NFR-002.
 *
 * Deduplication collapses IDENTITY. It never collapses EVIDENCE (REQ-046):
 * a canonical skill with 47 occurrences has 47 repositories that must each be
 * credited, and attribution is the licence obligation (NFR-025).
 */
import { contentHash, normalisedHash, partitionKey, gitBlobSha,
         occurrenceKey, resolveRelationship, lineageSignals,
         RELATIONSHIP } from '../../skill-core/src/index.js';

export const DEDUP_VERSION = '0.1.0';

export function fingerprint(rawText) {
  return {
    contentHash: contentHash(rawText),
    normalisedHash: normalisedHash(rawText),
    partitionKey: partitionKey(contentHash(rawText)),
    gitBlobSha: gitBlobSha(rawText),   // DEC-012: SOURCE-FACT cross-check, never identity
  };
}

/**
 * Resolves one occurrence against the canonical store.
 * REQ-016: keyed on content, so re-running is a no-op rather than a duplicate.
 */
/**
 * DATABASE.md SS46: "Skill imported -> Database updated -> Search index updated later."
 * Indexing is deliberately NOT done here. Maintaining it inline cost ~46 MB at the
 * 10,000-record rung and pushed the pipeline over NFR-014's 128 MB - a self-inflicted
 * regression caught by re-running the existing ladder evidence, not by review.
 * The index is populated by rebuildSearchIndex() (REQ-052), which is also the recovery
 * path, so there is one way to build it rather than two that can disagree.
 */
export async function resolveOccurrence({ store, discovery, canonical, fingerprints, now, rawObjectKey = null }) {
  if (typeof now !== 'string') throw new TypeError('resolveOccurrence requires a UTC timestamp (NFR-038)');

  // Tier 1: exact bytes (REQ-044).
  const exact = await store.findByContentHash(fingerprints.contentHash);
  // Tier 2: identical after normalisation - catches CRLF/LF and trailing-whitespace
  // variants that are pervasive across 282,200 repositories and would otherwise
  // inflate the canonical count with pure noise (DEC-012).
  const near = exact ? null : await store.findByNormalisedHash(fingerprints.normalisedHash);

  const decision = resolveRelationship(
    { contentHash: fingerprints.contentHash, normalisedHash: fingerprints.normalisedHash },
    exact ? { contentHash: exact.content_hash, normalisedHash: exact.normalised_hash, canonicalId: exact.id }
          : near ? { contentHash: near.content_hash, normalisedHash: near.normalised_hash, canonicalId: near.id }
                 : null);

  let canonicalId = decision.canonicalId;
  let created = false;
  if (!canonicalId) {
    canonicalId = await store.upsertCanonical(canonical);
    created = true;
  }

  const key = occurrenceKey({ source: discovery.source, repoFullName: discovery.repo_full_name,
                              path: discovery.path, contentHash: fingerprints.contentHash });

  await store.upsertOccurrence({
    occurrenceKey: key, sourceId: discovery.source,
    repoFullName: discovery.repo_full_name, path: discovery.path,
    contentHash: fingerprints.contentHash, normalisedHash: fingerprints.normalisedHash,
    canonicalId,
    relationship: decision.relationship ?? (created ? null : RELATIONSHIP.EXACT_DUPLICATE),
    relationshipReason: decision.reason,
    sourceVersionRef: fingerprints.gitBlobSha,
    fileSha: discovery.source_payload?.file_sha ?? null,
    rawObjectKey,                                   // REQ-029: the canonical record keeps the raw reference
    discoveredAt: discovery.discovered_at ?? now,
    stage: 'DEDUPLICATED',
  });

  return { canonicalId, occurrenceKey: key, created,
           relationship: decision.relationship, reason: decision.reason,
           lineage: lineageSignals({ isFork: discovery.source_payload?.is_fork === 1 }) };
}

/**
 * REQ-047 / NFR-002. Compares OUR content grouping against the corpus's own
 * `file_sha` grouping. Both answer "are these byte-identical?", so unlike
 * frontmatter_valid (see CR-004) these two columns are genuinely comparable.
 */
export function compareGrouping(rows) {
  const ours = new Map();     // content_hash -> [row index]
  const theirs = new Map();   // file_sha     -> [row index]
  const shaCheck = { match: 0, mismatch: 0, unverifiable: 0, mismatches: [] };

  rows.forEach((r, i) => {
    if (typeof r.content === 'string' && r.content !== '') {
      const fp = fingerprint(r.content);
      push(ours, fp.contentHash, i);
      // Per-row byte-exactness oracle: recompute git's own hash and compare.
      if (r.file_sha) {
        if (fp.gitBlobSha === r.file_sha) shaCheck.match++;
        else { shaCheck.mismatch++; shaCheck.mismatches.push({ i, ours: fp.gitBlobSha, theirs: r.file_sha }); }
      } else shaCheck.unverifiable++;
    } else shaCheck.unverifiable++;
    if (r.file_sha) push(theirs, r.file_sha, i);
  });

  // Only groups where we hold content for every member are comparable.
  const comparable = [...theirs.entries()].filter(([, idx]) =>
    idx.every((i) => typeof rows[i].content === 'string' && rows[i].content !== ''));

  let agree = 0; const disagreements = [];
  for (const [sha, idx] of comparable) {
    const ourHashes = new Set(idx.map((i) => fingerprint(rows[i].content).contentHash));
    if (ourHashes.size === 1) agree++;
    else disagreements.push({ file_sha: sha, members: idx.length, ourGroups: ourHashes.size });
  }

  return {
    comparableGroups: comparable.length,
    multiMemberGroups: comparable.filter(([, i]) => i.length > 1).length,
    agree,
    disagreements,
    agreement: comparable.length ? agree / comparable.length : null,
    shaCheck,
  };
}

const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
