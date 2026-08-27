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

/**
 * DES-017. Object storage (fs | r2 | memory). Bytes under an opaque key.
 * NOT a database (DATABASE.md rule 6): `head` is metadata, and listing is not querying.
 *
 * Existing verb names are kept. `head` IS the metadata call, so no new verb is invented.
 *
 * Contract:
 *   put(key, bytes, meta) -> { key, bytes, created, alreadyExisted }
 *   get(key)              -> { bytes, meta } | null
 *   head(key)             -> meta | null
 *   exists(key)           -> boolean
 *   delete(key)           -> boolean          (true if bytes were removed)
 *
 * REQ-029 immutability: `put` on an existing key whose stored bytes differ from the
 * incoming bytes MUST throw. Because keys derive from the content hash this should be
 * unreachable - it is enforced anyway, since "unreachable by construction" is a claim
 * and a check is evidence.
 *
 * No path, bucket, SDK, HTTP or filesystem concept crosses this port.
 */
export const ObjectStore = Object.freeze({
  methods: ['put', 'get', 'head', 'delete', 'exists'],
  guarantees: { contentAddressed: true, immutable: true, listingIsNotQuerying: true },
});

/** REQ-029: the only key shape any adapter accepts. Validated before a path is built. */
export const OBJECT_KEY_RE = /^sha256:[0-9a-f]{64}$/;

export function assertObjectStoreContract(store) {
  for (const m of ObjectStore.methods) {
    if (typeof store?.[m] !== 'function') {
      throw new Error(`DES-017 violated: ObjectStore adapter missing ${m}()`);
    }
  }
  return true;
}

/**
 * REQ-033: raw content is INTERNAL PROCESSING DATA behind an access-control layer.
 * Every read names its purpose; anything outside this list is refused. The point is
 * not that the list is long - it is that "serve to a user" is not on it, and cannot
 * be added without editing this file and failing a test.
 */
export const RAW_PURPOSE = Object.freeze({
  REPROCESS: 'reprocess',
  RETENTION: 'retention',
  REMOVAL: 'removal',
  VERIFY: 'verify',
});

export function assertRawPurpose(purpose) {
  if (!Object.values(RAW_PURPOSE).includes(purpose)) {
    throw new Error(
      `REQ-033 violated: "${purpose}" is not a permitted raw-access purpose. ` +
      `Raw content is internal processing data and is never served (REQ-062).`);
  }
  return true;
}

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
