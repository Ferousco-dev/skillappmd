/**
 * REQ-018 / DEC-005: messages carry REFERENCES, never content.
 * Traces: DES-069.
 *
 * Cloudflare caps a message at 128 KB and bills per 64 KB written, read OR deleted,
 * so a content-carrying payload multiplies cost as well as risking rejection.
 * R3 measured mean body 4,425 B - comfortably under the cap - which is exactly why
 * this needs enforcing: the rule looks unnecessary right up until a p99 file or a
 * future source breaks it.
 */

export const MAX_MESSAGE_BYTES = 128 * 1024;   // Cloudflare Queues limit (verified R1 §6.2)
export const MAX_FIELD_BYTES = 4 * 1024;       // no single field should approach a payload

/** Field names that indicate raw content has leaked into a message. */
const CONTENT_KEYS = new Set(['content', 'bytes', 'body', 'raw', 'text', 'source_payload']);

export function assertReferenceOnly(payload) {
  const size = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
  if (size > MAX_MESSAGE_BYTES) {
    throw new Error(`REQ-018 violated: message is ${size} bytes, over the ${MAX_MESSAGE_BYTES} byte limit`);
  }
  walk(payload, []);
  return { bytes: size };
}

function walk(node, path) {
  if (node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    const here = [...path, k].join('.');
    if (CONTENT_KEYS.has(k) && typeof v === 'string' && v.length > 0) {
      throw new Error(
        `REQ-018 violated: message field "${here}" looks like raw content. ` +
        'Messages carry a storage key and a content hash; content lives in the object store (DEC-005).');
    }
    if (typeof v === 'string' && Buffer.byteLength(v, 'utf8') > MAX_FIELD_BYTES) {
      throw new Error(`REQ-018 violated: message field "${here}" is over ${MAX_FIELD_BYTES} bytes; pass a reference`);
    }
    walk(v, [...path, k]);
  }
}
