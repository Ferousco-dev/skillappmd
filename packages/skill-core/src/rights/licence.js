/**
 * Three-layer licence model. DOM-007, REQ-056, REQ-057, REQ-060, DEC-006.
 * Pure functions over plain data — testable exhaustively with no infrastructure.
 * Traces: DES-038, DES-040.
 */

export const UNKNOWN = 'UNKNOWN';

/** Minimal SPDX map. REQ-057: normalise where recognised, UNKNOWN otherwise — NEVER a guess. */
const SPDX = new Map(Object.entries({
  'mit': 'MIT', 'mit license': 'MIT',
  'apache-2.0': 'Apache-2.0', 'apache 2.0': 'Apache-2.0', 'apache license 2.0': 'Apache-2.0',
  'bsd-2-clause': 'BSD-2-Clause', 'bsd-3-clause': 'BSD-3-Clause',
  'isc': 'ISC', 'unlicense': 'Unlicense', 'cc0-1.0': 'CC0-1.0',
  'cc-by-4.0': 'CC-BY-4.0',
  'gpl-2.0': 'GPL-2.0', 'gpl-3.0': 'GPL-3.0',
  'lgpl-2.1': 'LGPL-2.1', 'lgpl-3.0': 'LGPL-3.0',
  'agpl-3.0': 'AGPL-3.0', 'mpl-2.0': 'MPL-2.0',
}));

/** Copyleft is treated as non-redistributable in Phase 1 (LICENSING.md §8, ASSUMPTION). */
const COPYLEFT = new Set(['GPL-2.0','GPL-3.0','LGPL-2.1','LGPL-3.0','AGPL-3.0','MPL-2.0']);
const PERMISSIVE = new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','Unlicense','CC0-1.0','CC-BY-4.0']);

/**
 * REQ-057. Returns a canonical SPDX id, or UNKNOWN.
 * A licence guessed wrong is worse than one marked unknown: the first produces
 * false confidence, the second produces a research task.
 */
export function normaliseSpdx(raw) {
  if (raw === null || raw === undefined) return UNKNOWN;
  const key = String(raw).trim().toLowerCase();
  if (key === '' || key === 'unknown' || key === 'other' || key === 'noassertion') return UNKNOWN;
  return SPDX.get(key) ?? UNKNOWN;
}

export function isPermissive(spdx) { return PERMISSIVE.has(spdx); }
export function isCopyleft(spdx) { return COPYLEFT.has(spdx); }

/** Restrictiveness ordering for REQ-060's "more restrictive wins". Higher = more restrictive. */
function restrictiveness(spdx) {
  if (spdx === UNKNOWN) return 2;      // unknown is treated as most restrictive for redistribution
  if (COPYLEFT.has(spdx)) return 1;
  return 0;
}

/**
 * REQ-060 / DEC-006: where L2 (repository) and L3 (frontmatter claim) disagree,
 * retain BOTH, flag the conflict, apply the more restrictive.
 * L3 is a CLAIM, never an authority.
 */
export function resolveLicence({ l1 = null, l2 = null, l3 = null } = {}) {
  const L1 = normaliseSpdx(l1?.spdx ?? l1);
  const L2 = normaliseSpdx(l2?.spdx ?? l2);
  const L3 = normaliseSpdx(l3?.spdx ?? l3);

  const conflict = L2 !== UNKNOWN && L3 !== UNKNOWN && L2 !== L3;
  let effective;
  if (L2 === UNKNOWN) {
    // A frontmatter claim without repository backing does not establish a licence.
    effective = UNKNOWN;
  } else if (conflict) {
    effective = restrictiveness(L2) >= restrictiveness(L3) ? L2 : L3;
  } else {
    effective = L2;
  }

  return {
    l1_dataset: { spdx: L1, evidence: l1?.evidence ?? null },
    l2_repository: { spdx: L2, evidence: l2?.evidence ?? null },
    l3_declared: { spdx: L3, evidence: l3?.evidence ?? null },
    conflict,
    effective,
  };
}
