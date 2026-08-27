/**
 * SQLite-backed durable Queue adapter. DES-009, DES-010, DES-013, DES-014.
 * REQ-015, REQ-017, REQ-019, REQ-020, REQ-021, REQ-022, REQ-023.
 *
 * This adapter DELIBERATELY reproduces Cloudflare Queues semantics (DEC-025):
 * at-least-once delivery, no ordering guarantee, native DLQ, and the rule that a
 * consumer without a DLQ must not start.
 *
 * A local queue that never duplicates would let non-idempotent code pass locally
 * and fail in production - precisely the bug class NFR-027's two-adapter rule
 * exists to prevent. Testing against the easier adapter is not testing.
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertQueueConfig } from '../../../ports/src/index.js';
import { assertReferenceOnly } from './payload-guard.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY,
     queue TEXT NOT NULL,
     payload TEXT NOT NULL,
     idempotency_key TEXT,
     attempts INTEGER NOT NULL DEFAULT 0,
     visible_at INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'ready',   -- ready | done | dead
     last_error TEXT,
     enqueued_at TEXT NOT NULL,
     dead_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_msg_poll ON messages(queue, status, visible_at)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_idem ON messages(idempotency_key)`,
  // REQ-016: the consumer-side idempotency ledger. At-least-once delivery makes
  // this load-bearing, and it is Cloudflare's own prescribed mitigation.
  `CREATE TABLE IF NOT EXISTS processed (
     idempotency_key TEXT PRIMARY KEY,
     first_processed_at TEXT NOT NULL,
     deliveries INTEGER NOT NULL DEFAULT 1
   )`,
];

export class LocalQueue {
  #db; #now; #rng;

  /**
   * @param {object} o
   * @param {() => string} o.clock    NFR-038: UTC RFC3339. Injected, never implicit.
   * @param {() => number} [o.rng]    injected so jitter is deterministic in tests (NFR-001)
   */
  constructor({ path = ':memory:', clock, rng = Math.random } = {}) {
    if (typeof clock !== 'function') throw new TypeError('LocalQueue requires a clock (NFR-038)');
    this.#now = clock; this.#rng = rng;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL');
    for (const s of SCHEMA) this.#db.exec(s);
  }

  close() { this.#db.close(); }

  send(queue, payload, { idempotencyKey = null, delayMs = 0 } = {}) {
    assertReferenceOnly(payload);                        // REQ-018
    const id = randomUUID();
    this.#db.prepare(
      `INSERT INTO messages (id, queue, payload, idempotency_key, visible_at, enqueued_at)
       VALUES (?,?,?,?,?,?)`
    ).run(id, queue, JSON.stringify(payload), idempotencyKey, Date.now() + delayMs, this.#now());
    return id;
  }

  sendBatch(queue, payloads, opts = {}) { return payloads.map((p) => this.send(queue, p, opts)); }

  depth(queue) {
    return this.#db.prepare(
      `SELECT COUNT(*) AS n FROM messages WHERE queue = ? AND status = 'ready'`).get(queue).n;
  }

  /**
   * REQ-019: exponential backoff with jitter, bounded attempts.
   * Retries and DLQ writes are BILLABLE Cloudflare operations, so a bound is a
   * cost control as much as a reliability control (OBSERVABILITY.md §3).
   */
  #backoffMs(attempt, base) {
    const exp = base * 2 ** (attempt - 1);
    return Math.round(exp * (0.5 + this.#rng() * 0.5));   // full-ish jitter
  }

  /**
   * @param {object} config  MUST include deadLetterQueue - see DEC-025. Without a DLQ,
   *   Cloudflare deletes exhausted messages permanently, so a missing DLQ is silent
   *   data loss. That is a startup failure here, not a warning in a log nobody reads.
   * @param {number} [config.duplicateRate] deliberately redeliver a fraction of messages,
   *   reproducing at-least-once semantics so non-idempotent consumers fail LOCALLY.
   */
  async consume(queue, handler, config = {}) {
    assertQueueConfig(config);                            // throws without a DLQ
    const { deadLetterQueue, maxAttempts, batchSize = 10, backoffBaseMs = 100,
            duplicateRate = 0, maxBatches = Infinity } = config;

    const stats = { delivered: 0, succeeded: 0, retried: 0, deadLettered: 0,
                    duplicatesDelivered: 0, duplicatesAbsorbed: 0 };
    let batches = 0;

    while (batches < maxBatches) {
      const rows = this.#db.prepare(
        `SELECT * FROM messages WHERE queue = ? AND status = 'ready' AND visible_at <= ?
         ORDER BY visible_at LIMIT ?`).all(queue, Date.now(), batchSize);
      if (rows.length === 0) break;
      batches++;

      for (const row of rows) {
        const deliveries = [row];
        // At-least-once: the SAME message may arrive more than once.
        if (duplicateRate > 0 && this.#rng() < duplicateRate) {
          deliveries.push(row); stats.duplicatesDelivered++;
        }

        for (const msg of deliveries) {
          stats.delivered++;
          const payload = JSON.parse(msg.payload);

          // REQ-016: absorb duplicates at the consumer, per Cloudflare's own guidance.
          if (msg.idempotency_key) {
            const seen = this.#db.prepare(
              'SELECT deliveries FROM processed WHERE idempotency_key = ?').get(msg.idempotency_key);
            if (seen) {
              this.#db.prepare(
                'UPDATE processed SET deliveries = deliveries + 1 WHERE idempotency_key = ?')
                .run(msg.idempotency_key);
              stats.duplicatesAbsorbed++;
              continue;
            }
          }

          try {
            await handler(payload, { messageId: msg.id, attempt: msg.attempts + 1 });
            if (msg.idempotency_key) {
              this.#db.prepare(
                'INSERT OR IGNORE INTO processed (idempotency_key, first_processed_at) VALUES (?,?)')
                .run(msg.idempotency_key, this.#now());
            }
            this.#db.prepare(`UPDATE messages SET status='done' WHERE id = ?`).run(msg.id);
            stats.succeeded++;
          } catch (err) {
            const attempt = msg.attempts + 1;
            if (attempt >= maxAttempts) {
              // REQ-020: to the DLQ, never retried forever.
              this.#db.prepare(
                `UPDATE messages SET status='dead', attempts=?, last_error=?, queue=?, dead_at=?
                 WHERE id = ?`).run(attempt, String(err.message), deadLetterQueue, this.#now(), msg.id);
              stats.deadLettered++;
            } else {
              this.#db.prepare(
                `UPDATE messages SET attempts=?, last_error=?, visible_at=? WHERE id = ?`)
                .run(attempt, String(err.message), Date.now() + this.#backoffMs(attempt, backoffBaseMs), msg.id);
              stats.retried++;
            }
            break;   // do not deliver the duplicate of a message that just failed
          }
        }
      }
    }
    return stats;
  }

  /** REQ-021: dead letters are listable, inspectable and resubmittable. */
  deadLetters(dlq, { cursor = null, limit = 50 } = {}) {
    const rows = cursor
      ? this.#db.prepare(
          `SELECT * FROM messages WHERE queue=? AND status='dead' AND id > ? ORDER BY id LIMIT ?`)
          .all(dlq, cursor, limit)
      : this.#db.prepare(
          `SELECT * FROM messages WHERE queue=? AND status='dead' ORDER BY id LIMIT ?`).all(dlq, limit);
    return { rows, cursor: { next: rows.length === limit ? rows.at(-1).id : null, limit } };
  }

  inspect(id) { return this.#db.prepare('SELECT * FROM messages WHERE id = ?').get(id) ?? null; }

  resubmit(id, targetQueue) {
    const m = this.inspect(id);
    if (!m) throw new Error(`dead letter not found: ${id}`);
    if (m.status !== 'dead') throw new Error(`message ${id} is not dead-lettered (status=${m.status})`);
    this.#db.prepare(
      `UPDATE messages SET status='ready', attempts=0, last_error=NULL, queue=?, visible_at=?, dead_at=NULL
       WHERE id = ?`).run(targetQueue, Date.now(), id);
    return id;
  }

  /** Test/diagnostic helpers. Read-only except __forceVisible, which only moves a timer. */
  readyAfter(queue) {
    return this.#db.prepare(
      `SELECT id, attempts, visible_at FROM messages WHERE queue=? AND status='ready' ORDER BY id`).all(queue);
  }
  __forceVisible(id) {
    this.#db.prepare('UPDATE messages SET visible_at = ? WHERE id = ?').run(Date.now(), id);
  }

  deliveriesFor(key) {
    return this.#db.prepare('SELECT deliveries FROM processed WHERE idempotency_key = ?').get(key)?.deliveries ?? 0;
  }
}
