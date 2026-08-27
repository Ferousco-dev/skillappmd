/**
 * Rights posture. DOM-008, REQ-058, REQ-059, REQ-062, NFR-006, DEC-009, DEC-018.
 * Traces: DES-039, DES-021.
 *
 * The brief's four concepts, with `unknown` as an EXPLICIT state (DEC-018).
 * "Known not redistributable" and "not known whether redistributable" have the
 * same consequence today and entirely different consequences tomorrow.
 */
import { UNKNOWN, isPermissive, resolveLicence } from './licence.js';
import { RIGHTS_STATE, RETENTION_POLICY } from '../model/types.js';

/** REQ-062 / DEC-009: Phase 1 serves no third-party content under ANY licence. */
export const PHASE_1_SERVES_CONTENT = false;

export function computeRights(licenceInput, { now } = {}) {
  if (typeof now !== 'string') {
    throw new TypeError('computeRights requires an explicit UTC timestamp (NFR-038; Clock port DES-058)');
  }
  const licence = resolveLicence(licenceInput);
  const known = licence.effective !== UNKNOWN;

  // REQ-058: absent, unparseable or unresolvable licence => redistributable false, ALWAYS.
  // Never infer permission from public accessibility (BRIEF §38).
  const redistributable = known && isPermissive(licence.effective);

  let basis;
  if (!known) {
    basis = licence.l3_declared.spdx !== UNKNOWN
      ? 'L3 declared without L2 repository backing; a claim is not authority'
      : 'no recognised licence at any layer';
  } else if (licence.conflict) {
    basis = `L2/L3 conflict (${licence.l2_repository.spdx} vs ${licence.l3_declared.spdx}) -> most restrictive applied`;
  } else {
    basis = `L2 repository licence ${licence.effective}`;
  }

  return {
    state: known ? RIGHTS_STATE.KNOWN : RIGHTS_STATE.UNKNOWN,
    indexable: true,   // indexing metadata + linking to origin is the product (DEC-009)
    linkable: true,
    redistributable,
    cacheable: known,  // additional signal; NEVER a substitute for `unknown` (DEC-018)
    basis,
    computed_at: now,
    licence,
  };
}

/** REQ-098 / DEC-019: retention is rights-aware and defaults to non-permanent. */
export function retentionFor(rights) {
  if (rights.state === RIGHTS_STATE.UNKNOWN) return RETENTION_POLICY.PROCESS_THEN_DELETE;
  if (!rights.redistributable) return RETENTION_POLICY.SHORT;
  return RETENTION_POLICY.STANDARD;
}

/**
 * NFR-006, as an executable invariant rather than a hope.
 * 0 records may claim redistributable without recorded L2 evidence.
 */
export function assertRightsInvariant(rights) {
  if (rights.redistributable && rights.licence.l2_repository.spdx === UNKNOWN) {
    throw new Error('NFR-006 violated: redistributable=true without a recorded L2 licence');
  }
  if (rights.state === RIGHTS_STATE.UNKNOWN && rights.redistributable) {
    throw new Error('REQ-058 violated: unknown rights state cannot be redistributable');
  }
  return true;
}
