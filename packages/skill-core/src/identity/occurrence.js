/**
 * Occurrence identity and dedup resolution.
 * DOM-001..DOM-004, REQ-044, REQ-045, REQ-046, DEC-014. Traces: DES-027, DES-064.
 */
import { RELATIONSHIP } from '../model/types.js';

/**
 * DOM-001: an occurrence is an OBSERVATION, never an identity.
 * DOM-003 / DEC-014: keyed on origin repository coordinates, never an aggregator's id.
 * If SkillsMP terminated access tomorrow (its ToS permits this without notice),
 * zero canonical identities would be invalidated.
 */
export function occurrenceKey({ source, repoFullName, path, contentHash }) {
  for (const [k, v] of Object.entries({ source, repoFullName, path, contentHash })) {
    if (typeof v !== 'string' || v === '') {
      throw new TypeError(`occurrenceKey requires a non-empty ${k} (DOM-001)`);
    }
  }
  return `${source}::${repoFullName}::${path}::${contentHash}`;
}

/** REQ-016 / DEC-025: at-least-once delivery makes a deterministic id load-bearing. */
export function idempotencyKey(stage, occKey) { return `${stage}::${occKey}`; }

/**
 * REQ-044, REQ-045. Resolution order: exact content, then normalised content.
 * Name equality is NEVER evidence - the spec lets any repo declare `name: pdf`,
 * and the corpus contains thousands.
 */
export function resolveRelationship(incoming, existing) {
  if (!existing) return { relationship: null, canonicalId: null, reason: 'new canonical skill' };
  if (incoming.contentHash === existing.contentHash) {
    return { relationship: RELATIONSHIP.EXACT_DUPLICATE, canonicalId: existing.canonicalId,
             reason: 'identical content hash' };
  }
  if (incoming.normalisedHash === existing.normalisedHash) {
    return { relationship: RELATIONSHIP.NEAR_DUPLICATE, canonicalId: existing.canonicalId,
             reason: 'identical after line-ending and whitespace normalisation' };
  }
  return { relationship: null, canonicalId: null, reason: 'no fingerprint match' };
}

/** REQ-048: fork metadata is a signal DISTINCT from content equality (lineage vs dedup). */
export function lineageSignals({ isFork = false, forkParent = null } = {}) {
  return isFork ? [{ relationship: RELATIONSHIP.FORK, target: forkParent, evidence: 'repos.is_fork' }] : [];
}
