/**
 * Canonical domain types. Shapes only — no behaviour, no I/O.
 * Traces: DES-033, DES-036, DES-039, DOM-001..DOM-013, SRS §6.
 */

/** DOM-005: closed vocabulary. Name equality is never evidence (REQ-045). */
export const RELATIONSHIP = Object.freeze({
  EXACT_DUPLICATE: 'EXACT_DUPLICATE',
  NEAR_DUPLICATE: 'NEAR_DUPLICATE',
  FORK: 'FORK',
  MIRROR: 'MIRROR',
  VERSION: 'VERSION',
  RELATED: 'RELATED',
  ALTERNATIVE: 'ALTERNATIVE',
  UNRELATED: 'UNRELATED',
});

/** DOM-013 / REQ-092: identity classes carry different privacy weight. */
export const IDENTITY_CLASS = Object.freeze({
  REPOSITORY: 'repository',
  ORGANISATION: 'organisation',
  INDIVIDUAL: 'individual',
});

/**
 * DOM-006: a field value is a source fact OR an AppMD inference. Never both,
 * never merged. This is the distinction the whole system rests on.
 */
export const ORIGIN_KIND = Object.freeze({
  SOURCE_FACT: 'source_fact',
  APPMD_INFERENCE: 'appmd_inference',
});

/** DOM-008 / DEC-018: `unknown` is a state in its own right, never all-false booleans. */
export const RIGHTS_STATE = Object.freeze({ KNOWN: 'known', UNKNOWN: 'unknown' });

/** REQ-098 / DEC-019: retention defaults to non-permanent and is rights-aware. */
export const RETENTION_POLICY = Object.freeze({
  PROCESS_THEN_DELETE: 'process-then-delete',
  SHORT: 'short',
  STANDARD: 'standard',
});

/** INGESTION.md §1. PARSE_FAILED is terminal and is NOT a dead letter: bad input is data. */
export const STAGE = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  FETCHED: 'FETCHED',
  PARSED: 'PARSED',
  PARSE_FAILED: 'PARSE_FAILED',
  NORMALISED: 'NORMALISED',
  FINGERPRINTED: 'FINGERPRINTED',
  DEDUPLICATED: 'DEDUPLICATED',
  STORED: 'STORED',
  RETENTION_SET: 'RETENTION_SET',
  DEAD_LETTER: 'DEAD_LETTER',
});
