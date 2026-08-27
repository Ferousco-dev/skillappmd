import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentHash, normalisedHash, normaliseText, gitBlobSha, partitionKey,
  occurrenceKey, idempotencyKey, resolveRelationship, lineageSignals, RELATIONSHIP,
} from '../src/index.js';

test('TC-012 REQ-042 content hash is stable and byte-sensitive', () => {
  assert.equal(contentHash('hello'), contentHash('hello'));
  assert.notEqual(contentHash('hello'), contentHash('hello '));
});

test('TC-013 REQ-043 normalisation collapses CRLF/LF and trailing whitespace', () => {
  assert.equal(normalisedHash('a\r\nb\r\n'), normalisedHash('a\nb\n'));
  assert.equal(normalisedHash('a   \nb\t\n'), normalisedHash('a\nb\n'));
  assert.equal(normalisedHash('a\nb'), normalisedHash('a\nb\n\n\n'));
});

test('TC-014 REQ-042/043 normalisation does NOT collapse genuinely different content', () => {
  assert.notEqual(normalisedHash('a\nb\n'), normalisedHash('a\nc\n'));
});

test('TC-015 normaliseText strips BOM and enforces exactly one final newline', () => {
  assert.equal(normaliseText('﻿x'), 'x\n');
  assert.equal(normaliseText('x\n\n\n'), 'x\n');
});

test('TC-016 DEC-012 git blob sha reproduces git\'s own algorithm', () => {
  // `printf '' | git hash-object --stdin` -> e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
  assert.equal(gitBlobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});

test('TC-017 NFR-033 partition key derives from the hash without schema change', () => {
  assert.equal(partitionKey(contentHash('x')).length, 2);
});

test('TC-018 DOM-001 occurrence key requires all four components', () => {
  const ok = { source: 'gitskills', repoFullName: 'o/r', path: 'p/SKILL.md', contentHash: 'sha256:x' };
  assert.ok(occurrenceKey(ok).includes('gitskills'));
  for (const missing of Object.keys(ok)) {
    assert.throws(() => occurrenceKey({ ...ok, [missing]: '' }), /DOM-001/);
  }
});

test('TC-019 REQ-016 idempotency key is deterministic per stage', () => {
  const k = occurrenceKey({ source: 's', repoFullName: 'o/r', path: 'p', contentHash: 'h' });
  assert.equal(idempotencyKey('PARSED', k), idempotencyKey('PARSED', k));
  assert.notEqual(idempotencyKey('PARSED', k), idempotencyKey('STORED', k));
});

test('TC-020 REQ-044 identical content resolves to one canonical skill', () => {
  const r = resolveRelationship(
    { contentHash: 'h1', normalisedHash: 'n1' },
    { contentHash: 'h1', normalisedHash: 'n1', canonicalId: 'cs_1' });
  assert.equal(r.relationship, RELATIONSHIP.EXACT_DUPLICATE);
  assert.equal(r.canonicalId, 'cs_1');
});

test('TC-021 REQ-043 CRLF variant resolves as NEAR_DUPLICATE, not a new skill', () => {
  const body = 'name: x\nbody';
  const a = { contentHash: contentHash(body), normalisedHash: normalisedHash(body), canonicalId: 'cs_1' };
  const b = { contentHash: contentHash(body.replace(/\n/g, '\r\n')), normalisedHash: normalisedHash(body.replace(/\n/g, '\r\n')) };
  const r = resolveRelationship(b, a);
  assert.equal(r.relationship, RELATIONSHIP.NEAR_DUPLICATE);
  assert.equal(r.canonicalId, 'cs_1');
});

test('TC-022 REQ-045 same name, different content is NOT a duplicate', () => {
  const r = resolveRelationship(
    { contentHash: 'h1', normalisedHash: 'n1', name: 'pdf' },
    { contentHash: 'h2', normalisedHash: 'n2', name: 'pdf', canonicalId: 'cs_9' });
  assert.equal(r.relationship, null, 'name equality is never evidence');
  assert.equal(r.canonicalId, null);
});

test('TC-023 REQ-048 fork metadata is a signal distinct from content equality', () => {
  assert.deepEqual(lineageSignals({ isFork: false }), []);
  const s = lineageSignals({ isFork: true, forkParent: 'up/stream' });
  assert.equal(s[0].relationship, RELATIONSHIP.FORK);
  assert.equal(s[0].evidence, 'repos.is_fork');
});
