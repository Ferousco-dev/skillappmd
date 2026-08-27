import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseSpdx, resolveLicence, computeRights, retentionFor, assertRightsInvariant,
  UNKNOWN, RIGHTS_STATE, RETENTION_POLICY,
} from '../src/index.js';

const NOW = '2026-08-27T13:45:00Z';

test('TC-001 REQ-057 recognised licences normalise to SPDX', () => {
  assert.equal(normaliseSpdx('MIT'), 'MIT');
  assert.equal(normaliseSpdx('  apache 2.0 '), 'Apache-2.0');
  assert.equal(normaliseSpdx('GPL-3.0'), 'GPL-3.0');
});

test('TC-002 REQ-057 unrecognised licence becomes UNKNOWN, never a guess', () => {
  for (const v of ['some custom licence', '', null, undefined, 'NOASSERTION', 'other']) {
    assert.equal(normaliseSpdx(v), UNKNOWN, `expected UNKNOWN for ${JSON.stringify(v)}`);
  }
});

test('TC-003 REQ-058 L2 present and permissive => known + redistributable', () => {
  const r = computeRights({ l2: { spdx: 'MIT', evidence: 'repos.license' } }, { now: NOW });
  assert.equal(r.state, RIGHTS_STATE.KNOWN);
  assert.equal(r.redistributable, true);
  assertRightsInvariant(r);
});

test('TC-004 REQ-058 no licence at any layer => unknown, not redistributable', () => {
  const r = computeRights({}, { now: NOW });
  assert.equal(r.state, RIGHTS_STATE.UNKNOWN);
  assert.equal(r.redistributable, false);
});

test('TC-005 DEC-018 L3 claim WITHOUT L2 backing does not establish a licence', () => {
  const r = computeRights({ l3: { spdx: 'Apache-2.0', evidence: 'frontmatter.license' } }, { now: NOW });
  assert.equal(r.state, RIGHTS_STATE.UNKNOWN, 'a claim is not authority');
  assert.equal(r.redistributable, false);
  assert.match(r.basis, /claim is not authority/);
});

test('TC-006 DEC-018 unknown is an EXPLICIT state, not all-false booleans', () => {
  const r = computeRights({}, { now: NOW });
  // The distinction that matters: indexable/linkable stay true, and `state` carries the
  // fact that the denial rests on ABSENT evidence rather than evidence of prohibition.
  assert.equal(r.state, RIGHTS_STATE.UNKNOWN);
  assert.equal(r.indexable, true);
  assert.equal(r.linkable, true);
  assert.equal(r.cacheable, false);
  assert.notEqual(r.state, undefined, 'unknown must be representable, not inferred from booleans');
});

test('TC-007 REQ-060 L2/L3 conflict retains both, flags it, applies the more restrictive', () => {
  const lic = resolveLicence({
    l2: { spdx: 'GPL-3.0', evidence: 'repos.license' },
    l3: { spdx: 'MIT', evidence: 'frontmatter.license' },
  });
  assert.equal(lic.conflict, true);
  assert.equal(lic.l2_repository.spdx, 'GPL-3.0');
  assert.equal(lic.l3_declared.spdx, 'MIT', 'both layers retained');
  assert.equal(lic.effective, 'GPL-3.0', 'more restrictive wins');
});

test('TC-008 NFR-006 redistributable=true without L2 evidence is unrepresentable', () => {
  const forged = computeRights({}, { now: NOW });
  forged.redistributable = true;                       // simulate a defect downstream
  assert.throws(() => assertRightsInvariant(forged), /NFR-006|REQ-058/);
});

test('TC-009 LICENSING.md copyleft is not redistributable in Phase 1', () => {
  const r = computeRights({ l2: { spdx: 'AGPL-3.0', evidence: 'repos.license' } }, { now: NOW });
  assert.equal(r.state, RIGHTS_STATE.KNOWN, 'the licence IS known');
  assert.equal(r.redistributable, false, 'but Phase 1 does not redistribute copyleft');
});

test('TC-010 REQ-098/DEC-019 retention is rights-aware and defaults non-permanent', () => {
  assert.equal(retentionFor(computeRights({}, { now: NOW })), RETENTION_POLICY.PROCESS_THEN_DELETE);
  assert.equal(retentionFor(computeRights({ l2: { spdx: 'GPL-3.0' } }, { now: NOW })), RETENTION_POLICY.SHORT);
  assert.equal(retentionFor(computeRights({ l2: { spdx: 'MIT' } }, { now: NOW })), RETENTION_POLICY.STANDARD);
});

test('TC-011 NFR-038 rights computation refuses an implicit clock', () => {
  assert.throws(() => computeRights({ l2: { spdx: 'MIT' } }), /UTC timestamp/);
});
