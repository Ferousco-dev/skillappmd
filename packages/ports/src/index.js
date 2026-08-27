/**
 * PORTS — interface definitions only. No implementations, no vendor SDKs.
 * NFR-027: every port has >=2 adapters, one requiring no cloud account.
 * DATABASE.md §8. Ports speak in DOMAIN terms, never SQL — a port that leaks SQL
 * is a port that cannot be implemented by a document store.
 */

/** DES-029. Canonical source of truth (DEC-027: sqlite | d1 | postgres). */
export const CanonicalStore = Object.freeze({
  methods: [
    'findByContentHash', 'findByNormalisedHash', 'upsertOccurrence', 'upsertCanonical',
    'getCanonical', 'cursorScan', 'listOccurrences',
    'recordJob', 'getJob', 'listJobs',
    'getCursor', 'setCursor',
    'schemaVersion', 'migrate',
    'backup', 'restore', 'verifyRestore',
  ],
});

/** DES-017. Object storage (fs | r2). Bytes under a key. NOT a database (rule 6). */
export const ObjectStore = Object.freeze({
  methods: ['put', 'get', 'head', 'delete', 'exists'],
});

/**
 * DES-009. Queue (local-queue | cf-queue).
 * DEC-025: delivery is AT-LEAST-ONCE and ordering is UNVERIFIED, so no stage may
 * assume ordering and every consumer must be idempotent.
 */
export const Queue = Object.freeze({
  methods: ['send', 'sendBatch', 'consume', 'deadLetters', 'resubmit'],
  guarantees: { delivery: 'at-least-once', ordering: 'none', requiresIdempotentConsumer: true },
});

/** DES-063 / DES-053 / DES-058 / DES-007. */
export const Cache = Object.freeze({ methods: ['get', 'set', 'delete'] });
export const RateLimiter = Object.freeze({ methods: ['acquire', 'release', 'status'] });
export const Clock = Object.freeze({ methods: ['nowIso'] });   // NFR-038: UTC RFC3339 only
export const RobotsPolicy = Object.freeze({ methods: ['fetch', 'isAllowed', 'crawlDelay'] });

/** DES-001. SourceConnector (SOURCE_CONNECTORS.md §1). */
export const SourceConnector = Object.freeze({
  methods: ['id', 'accessPolicy', 'discover', 'identify', 'getMetadata', 'getContent', 'getVersion'],
});

/** REQ-007: a connector without a declared access policy cannot be registered. */
export function assertConnectorContract(connector) {
  for (const m of SourceConnector.methods) {
    if (typeof connector?.[m] !== 'function') {
      throw new Error(`REQ-001 violated: connector missing ${m}()`);
    }
  }
  const policy = connector.accessPolicy();
  if (!policy || typeof policy !== 'object') {
    throw new Error('REQ-007 violated: connector declares no access policy');
  }
  for (const f of ['max_concurrency', 'permitted_methods']) {
    if (policy[f] === undefined) {
      throw new Error(`REQ-006 violated: access policy missing ${f}`);
    }
  }
  if (policy.permitted_methods.includes('html-bulk')) {
    throw new Error('REQ-004/NFR-024 violated: bulk HTML retrieval is not a permitted method');
  }
  return true;
}

/**
 * DEC-025 / DES-013: Cloudflare deletes exhausted messages permanently when no DLQ
 * is configured. A configuration omission would therefore cause SILENT DATA LOSS,
 * so it is a startup failure rather than a warning in a log nobody reads.
 */
export function assertQueueConfig(config) {
  if (!config?.deadLetterQueue) {
    throw new Error(
      'DEC-025 violated: refusing to start a consumer without a dead letter queue. ' +
      'Without one, messages that reach the retry limit are deleted permanently.'
    );
  }
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
    throw new Error('REQ-019 violated: maxAttempts must be a positive integer');
  }
  return true;
}
