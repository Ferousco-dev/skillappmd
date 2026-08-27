/**
 * Fingerprints. REQ-042, REQ-043, DEC-012. Traces: DES-026.
 *
 * GitSkills `file_sha` is a git blob SHA - whitespace and line-ending sensitive.
 * It answers "byte-identical?" and nothing else, so it is retained as a SOURCE FACT
 * for cross-checking and is never AppMD's identity key.
 */
import { createHash } from 'node:crypto';

const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex');

/** REQ-042: exact tier, over raw bytes. */
export function contentHash(bytes) {
  if (!(bytes instanceof Uint8Array) && typeof bytes !== 'string') {
    throw new TypeError('contentHash requires bytes or a string');
  }
  return sha256(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes);
}

/**
 * REQ-043: normalised tier. Catches trivial variants that `file_sha` reports as
 * distinct skills - CRLF/LF differences are pervasive across 282,200 repositories,
 * and treating them as distinct would inflate the canonical count with pure noise.
 */
export function normaliseText(text) {
  return String(text)
    .replace(/^﻿/, '')          // strip BOM
    .replace(/\r\n?/g, '\n')         // CRLF / CR -> LF
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))   // trailing whitespace
    .join('\n')
    .replace(/\n+$/, '') + '\n';     // exactly one final newline
}

export function normalisedHash(text) {
  return sha256(Buffer.from(normaliseText(text), 'utf8'));
}

/** Git blob SHA, so we can cross-check the corpus's own column (DEC-012). */
export function gitBlobSha(bytes) {
  const b = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
}

/** NFR-033: content hashes are uniform, so prefix partitioning needs no schema change. */
export function partitionKey(hash, width = 2) {
  return hash.slice('sha256:'.length, 'sha256:'.length + width);
}
