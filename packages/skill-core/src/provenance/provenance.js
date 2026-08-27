/**
 * Provenance. DOM-006, DOM-009, DOM-013, REQ-040, REQ-061, REQ-092, NFR-004, NFR-005.
 * Traces: DES-036, DES-037, DES-041.
 */
import { ORIGIN_KIND, IDENTITY_CLASS } from '../model/types.js';

export const sourceFact = (sourceId, ref = null) =>
  ref ? `${ORIGIN_KIND.SOURCE_FACT}:${sourceId}#${ref}` : `${ORIGIN_KIND.SOURCE_FACT}:${sourceId}`;

export const appmdInference = (producer, version) =>
  `${ORIGIN_KIND.APPMD_INFERENCE}:${producer}@${version}`;

export function originKind(origin) {
  if (typeof origin !== 'string') return null;
  if (origin.startsWith(ORIGIN_KIND.SOURCE_FACT)) return ORIGIN_KIND.SOURCE_FACT;
  if (origin.startsWith(ORIGIN_KIND.APPMD_INFERENCE)) return ORIGIN_KIND.APPMD_INFERENCE;
  return null;
}

/**
 * NFR-004 / REQ-061: attribution is a WRITE-TIME invariant, not a read-time filter.
 * Filtering at read time means the bad record exists and every future read path must
 * remember to filter. Rejecting at write time means it cannot exist.
 * For most OSS licences, attribution failure IS the licence violation.
 */
export function assertAttribution(attribution) {
  const required = ['repository', 'owner', 'canonical_source_url'];
  for (const f of required) {
    if (!attribution?.[f] || String(attribution[f]).trim() === '') {
      throw new Error(`NFR-004 violated: record rejected, attribution.${f} is required`);
    }
  }
  return true;
}

/** NFR-005: every field value must be classifiable. An unclassifiable field is rejected. */
export function assertAllFieldsClassified(fieldOrigins) {
  const bad = Object.entries(fieldOrigins ?? {}).filter(([, v]) => originKind(v) === null);
  if (bad.length) {
    throw new Error(`NFR-005 violated: unclassifiable field origins: ${bad.map(([k]) => k).join(', ')}`);
  }
  return true;
}

/**
 * REQ-076: an inference without producer + version + timestamp is not storable.
 * Without them REQ-095 re-analysis cannot identify what to reprocess, and a stale
 * verdict is indistinguishable from a current one.
 */
export function assertInference(value) {
  for (const f of ['producer', 'version', 'at']) {
    if (!value?.[f]) throw new Error(`REQ-076 violated: inference missing ${f}`);
  }
  return true;
}

/** DOM-013 / REQ-092 / DEC-020: a person-linked field without a purpose is NOT stored. */
export function classifyIdentity({ isOrganisation = false, isRepository = false } = {}) {
  if (isRepository) return IDENTITY_CLASS.REPOSITORY;
  return isOrganisation ? IDENTITY_CLASS.ORGANISATION : IDENTITY_CLASS.INDIVIDUAL;
}

export function assertPersonalFieldPurpose(fields) {
  const bad = Object.entries(fields ?? {}).filter(([, meta]) => !meta?.purpose);
  if (bad.length) {
    throw new Error(`REQ-092 violated: person-linked fields without a stated purpose: ${bad.map(([k]) => k).join(', ')}`);
  }
  return true;
}
