import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sourceFact, appmdInference, originKind, assertAttribution, assertAllFieldsClassified,
  assertInference, classifyIdentity, assertPersonalFieldPurpose, ORIGIN_KIND, IDENTITY_CLASS,
} from '../src/index.js';

test('TC-024 DOM-006 source facts and inferences are distinguishable', async () => {
  assert.equal(originKind(sourceFact('gitskills')), ORIGIN_KIND.SOURCE_FACT);
  assert.equal(originKind(appmdInference('rights-engine', '0.1.0')), ORIGIN_KIND.APPMD_INFERENCE);
  assert.equal(originKind('something else'), null);
});

test('TC-025 NFR-004 a record without attribution is rejected AT WRITE TIME', async () => {
  const full = { repository: 'o/r', owner: 'o', canonical_source_url: 'https://github.com/o/r' };
  assert.ok(assertAttribution(full));
  for (const f of Object.keys(full)) {
    assert.throws(() => assertAttribution({ ...full, [f]: '' }), /NFR-004/);
  }
  assert.throws(() => assertAttribution(undefined), /NFR-004/);
});

test('TC-026 NFR-005 every field origin must be classifiable', async () => {
  assert.ok(assertAllFieldsClassified({ 'declared.name': sourceFact('gitskills') }));
  assert.throws(() => assertAllFieldsClassified({ 'declared.name': 'mystery' }), /NFR-005/);
});

test('TC-027 REQ-076 an inference without producer/version/at is not storable', async () => {
  assert.ok(assertInference({ producer: 'p', version: '1', at: '2026-08-27T00:00:00Z' }));
  for (const f of ['producer', 'version', 'at']) {
    const v = { producer: 'p', version: '1', at: 'z' }; delete v[f];
    assert.throws(() => assertInference(v), /REQ-076/);
  }
});

test('TC-028 DOM-013 identity resolves to three classes', async () => {
  assert.equal(classifyIdentity({ isRepository: true }), IDENTITY_CLASS.REPOSITORY);
  assert.equal(classifyIdentity({ isOrganisation: true }), IDENTITY_CLASS.ORGANISATION);
  assert.equal(classifyIdentity({}), IDENTITY_CLASS.INDIVIDUAL);
});

test('TC-029 REQ-092 a person-linked field without a stated purpose is not stored', async () => {
  assert.ok(assertPersonalFieldPurpose({ owner: { purpose: 'attribution' } }));
  assert.throws(() => assertPersonalFieldPurpose({ email: {} }), /REQ-092/);
});
