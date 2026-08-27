/**
 * Job lifecycle recording. DES-012. REQ-017, REQ-084, REQ-082.
 *
 * Imports NO adapter and NO vendor SDK - the store and clock arrive as ports
 * (NFR-028), which is what lets these stages run in either runtime.
 */
import { STAGE } from '../../skill-core/src/index.js';

/** REQ-017: the fields every job carries, without exception. */
export const JOB_FIELDS = Object.freeze(
  ['jobId', 'skillRef', 'sourceId', 'stage', 'attempt', 'status', 'startedAt', 'completedAt', 'error']);

export const JOB_STATUS = Object.freeze({
  RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed',
  DEAD_LETTERED: 'dead_lettered',
  /** INGESTION.md §1: bad input is DATA, not a system failure. Terminal, never retried. */
  PARSE_FAILED: 'parse_failed',
});

export class JobRecorder {
  #store; #clock; #counters;
  constructor({ store, clock }) {
    if (!store || typeof clock !== 'function') {
      throw new TypeError('JobRecorder requires a CanonicalStore port and a clock (NFR-038)');
    }
    this.#store = store; this.#clock = clock;
    this.#counters = new Map();
  }

  #bump(name, n = 1) { this.#counters.set(name, (this.#counters.get(name) ?? 0) + n); }

  async start({ jobId, skillRef, sourceId, stage, attempt = 1, contentHash = null }) {
    await this.#store.recordJob({ jobId, skillRef, sourceId, stage, attempt,
      status: JOB_STATUS.RUNNING, startedAt: this.#clock(), contentHash });
    return jobId;
  }

  /** startedAt is preserved by the store; callers complete a job by identity, not by restating it. */
  async #complete(job, patch) {
    await this.#store.recordJob({ startedAt: this.#clock(), contentHash: null, ...job, ...patch });
  }

  async succeed(job) {
    this.#complete(job, { status: JOB_STATUS.SUCCEEDED, completedAt: this.#clock(), error: null });
    this.#bump(`${job.stage.toLowerCase()}_succeeded`);
  }

  async fail(job, error) {
    this.#complete(job, { status: JOB_STATUS.FAILED,
      completedAt: this.#clock(), error: String(error?.message ?? error) });
    this.#bump('failed');
  }

  /**
   * A malformed SKILL.md is recorded with its reason and NOT retried. Retrying it
   * produces the identical failure forever and bills a queue operation each time.
   * Confusing bad input with system failure is how DLQs fill with noise and stop
   * being read.
   */
  async parseFailed(job, reason) {
    this.#complete(job, { stage: STAGE.PARSE_FAILED, status: JOB_STATUS.PARSE_FAILED,
      completedAt: this.#clock(), error: reason });
    this.#bump('parse_failed');
  }

  async deadLettered(job, error) {
    this.#complete(job, { stage: STAGE.DEAD_LETTER, status: JOB_STATUS.DEAD_LETTERED,
      completedAt: this.#clock(), error: String(error?.message ?? error) });
    this.#bump('dead_lettered');
  }

  /** REQ-082: counters, per stage. */
  counters() { return Object.fromEntries([...this.#counters].sort()); }

  /** REQ-084: "what happened to THIS skill?" is the operator's real question. */
  async history(skillRef) { return this.#store.listJobs({ skillRef }); }
}
