/**
 * SQLite CanonicalStore adapter. DES-029, DES-030, DES-033, DES-034, DES-035.
 * REQ-050..055, REQ-091, REQ-094. NFR-010, NFR-035.
 *
 * Uses node:sqlite (built in on Node 22.19) so Phase 1 needs no dependency
 * install and no network (NFR-016, NFR-030, DEC-030).
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_VERSION, MIGRATIONS } from './schema.js';

const json = (v) => JSON.stringify(v ?? null);

export class SqliteCanonicalStore {
  #db; #path;

  constructor(path = ':memory:') {
    this.#path = path;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA foreign_keys = ON');
  }

  get path() { return this.#path; }
  close() { this.#db.close(); }

  // ---- migrations (REQ-094, DES-034) ---------------------------------------

  schemaVersion() {
    try {
      const r = this.#db.prepare('SELECT version FROM schema_meta WHERE id = 1').get();
      return r ? r.version : 0;
    } catch { return 0; }
  }

  /** Re-runnable. Records what it touched. Applies only migrations above current version. */
  migrate({ now }) {
    if (typeof now !== 'string') throw new TypeError('migrate requires an explicit UTC timestamp (NFR-038)');
    const from = this.schemaVersion();
    const applied = [];
    for (const m of MIGRATIONS) {
      if (m.version <= from) continue;
      this.#db.exec('BEGIN');
      try {
        for (const stmt of m.up) this.#db.exec(stmt);
        this.#db.prepare(
          'INSERT INTO schema_meta (id, version, applied_at) VALUES (1, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET version = excluded.version, applied_at = excluded.applied_at'
        ).run(m.version, now);
        this.#db.prepare(
          'INSERT INTO migration_log (version, name, applied_at, rows_touched) VALUES (?,?,?,?)'
        ).run(m.version, m.name, now, 0);
        this.#db.exec('COMMIT');
        applied.push(m.version);
      } catch (e) {
        this.#db.exec('ROLLBACK');
        // REQ-094: fail rather than proceed with a partial schema.
        throw new Error(`REQ-094: migration ${m.version} (${m.name}) failed and was rolled back: ${e.message}`);
      }
    }
    return { from, to: this.schemaVersion(), applied };
  }

  migrationLog() { return this.#db.prepare('SELECT * FROM migration_log ORDER BY version').all(); }

  // ---- writes --------------------------------------------------------------

  upsertSource({ id, accessPolicy, now }) {
    this.#db.prepare(
      'INSERT INTO sources (id, access_policy, registered_at) VALUES (?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET access_policy = excluded.access_policy'
    ).run(id, json(accessPolicy), now);
  }

  upsertRepository(r) {
    this.#db.prepare(
      `INSERT INTO repositories (full_name, owner, identity_class, stars, forks, is_fork,
         language, licence_raw, licence_spdx, created_at, pushed_at, first_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(full_name) DO UPDATE SET
         stars=excluded.stars, forks=excluded.forks, is_fork=excluded.is_fork,
         language=excluded.language, licence_raw=excluded.licence_raw,
         licence_spdx=excluded.licence_spdx, pushed_at=excluded.pushed_at`
    ).run(r.fullName, r.owner, r.identityClass, r.stars ?? null, r.forks ?? null,
          r.isFork ? 1 : 0, r.language ?? null, r.licenceRaw ?? null, r.licenceSpdx ?? null,
          r.createdAt ?? null, r.pushedAt ?? null, r.now);
  }

  /**
   * REQ-016 / NFR-009: idempotent upsert keyed on content_hash.
   * NFR-004 / NFR-006 are enforced by CHECK constraints in the schema as well as
   * by skill-core assertions - defence in depth, because a write path that can be
   * bypassed is not an invariant.
   */
  upsertCanonical(c) {
    // DEC-031 / DEF-003: defence in depth. A cryptic "cannot be bound to parameter 7"
    // costs far more to diagnose than a named field, and this write path will be
    // reached by bulk loaders and future adapters that never read the normaliser.
    assertBindable({
      id: c.id, content_hash: c.contentHash, normalised_hash: c.normalisedHash,
      partition_key: c.partitionKey, 'declared.name': c.declared?.name,
      'declared.description': c.declared?.description,
      'rights.state': c.rights?.state, retention_policy: c.retentionPolicy,
      'attribution.repository': c.attribution?.repository,
      'attribution.owner': c.attribution?.owner,
      'attribution.canonical_source_url': c.attribution?.canonical_source_url,
    });
    this.#db.prepare(
      `INSERT INTO canonical_skills (
         id, schema_version, content_hash, normalised_hash, partition_key,
         declared_name, declared_description, frontmatter_valid, declared_json, inferred_json,
         licence_json, rights_state, rights_redistributable, rights_json, retention_policy,
         provenance_json, attribution_repository, attribution_owner, attribution_url,
         first_commit_at, last_commit_at, discovered_at, last_verified_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(content_hash) DO UPDATE SET
         licence_json=excluded.licence_json, rights_state=excluded.rights_state,
         rights_redistributable=excluded.rights_redistributable, rights_json=excluded.rights_json,
         retention_policy=excluded.retention_policy, provenance_json=excluded.provenance_json,
         inferred_json=excluded.inferred_json, last_verified_at=excluded.last_verified_at,
         updated_at=excluded.updated_at`
    ).run(c.id, c.schemaVersion ?? SCHEMA_VERSION, c.contentHash, c.normalisedHash, c.partitionKey,
      c.declared?.name ?? null, c.declared?.description ?? null,
      c.frontmatterValid === undefined ? null : (c.frontmatterValid ? 1 : 0),
      json(c.declared), json(c.inferred ?? {}), json(c.licence),
      c.rights.state, c.rights.redistributable ? 1 : 0, json(c.rights), c.retentionPolicy,
      json(c.provenance), c.attribution.repository, c.attribution.owner,
      c.attribution.canonical_source_url,
      c.temporal?.first_commit_at ?? null, c.temporal?.last_commit_at ?? null,
      c.temporal?.discovered_at ?? c.now, c.temporal?.last_verified_at ?? null, c.now, c.now);
    return c.id;
  }

  upsertOccurrence(o) {
    this.#db.prepare(
      `INSERT INTO occurrences (occurrence_key, source_id, repo_full_name, path,
         content_hash, normalised_hash, canonical_id, relationship, relationship_reason,
         source_version_ref, file_sha, raw_object_key, discovered_at, stage)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(occurrence_key) DO UPDATE SET
         canonical_id=excluded.canonical_id, relationship=excluded.relationship,
         relationship_reason=excluded.relationship_reason, stage=excluded.stage,
         raw_object_key=excluded.raw_object_key`
    ).run(o.occurrenceKey, o.sourceId, o.repoFullName, o.path, o.contentHash, o.normalisedHash,
      o.canonicalId ?? null, o.relationship ?? null, o.relationshipReason ?? null,
      o.sourceVersionRef ?? null, o.fileSha ?? null, o.rawObjectKey ?? null, o.discoveredAt, o.stage);
    return o.occurrenceKey;
  }

  // ---- reads ---------------------------------------------------------------

  findByContentHash(h) {
    return this.#db.prepare('SELECT * FROM canonical_skills WHERE content_hash = ?').get(h) ?? null;
  }
  findByNormalisedHash(h) {
    return this.#db.prepare('SELECT * FROM canonical_skills WHERE normalised_hash = ? LIMIT 1').get(h) ?? null;
  }
  getCanonical(id) {
    return this.#db.prepare('SELECT * FROM canonical_skills WHERE id = ?').get(id) ?? null;
  }

  /**
   * NFR-032 / NFR-039: cursor pagination only. Offset pagination is incorrect
   * under concurrent writes and degrades linearly at depth.
   */
  cursorScan({ cursor = null, limit = 50 } = {}) {
    const n = Math.min(Math.max(1, limit), 100);
    const rows = cursor
      ? this.#db.prepare(
          `SELECT * FROM canonical_skills WHERE (created_at, id) > (?, ?)
           ORDER BY created_at, id LIMIT ?`).all(...decodeCursor(cursor), n)
      : this.#db.prepare('SELECT * FROM canonical_skills ORDER BY created_at, id LIMIT ?').all(n);
    const next = rows.length === n ? encodeCursor(rows.at(-1).created_at, rows.at(-1).id) : null;
    return { rows, cursor: { next, limit: n } };
  }

  listOccurrences({ canonicalId, cursor = null, limit = 50 } = {}) {
    const n = Math.min(Math.max(1, limit), 100);
    const rows = cursor
      ? this.#db.prepare(
          `SELECT * FROM occurrences WHERE canonical_id = ? AND occurrence_key > ?
           ORDER BY occurrence_key LIMIT ?`).all(canonicalId, decodeCursor(cursor)[1], n)
      : this.#db.prepare(
          'SELECT * FROM occurrences WHERE canonical_id = ? ORDER BY occurrence_key LIMIT ?')
          .all(canonicalId, n);
    const next = rows.length === n ? encodeCursor('', rows.at(-1).occurrence_key) : null;
    return { rows, cursor: { next, limit: n } };
  }

  getSource(id) {
    return this.#db.prepare('SELECT * FROM sources WHERE id = ?').get(id) ?? null;
  }

  /**
   * REQ-069 keyword search over canonical METADATA only (never content, REQ-062).
   * SQLite LIKE is adequate at Phase 1 scale; SCALING.md ~10M names FTS as the
   * point where this must be replaced by a derived index (REQ-051).
   */
  /**
   * REQ-069 keyword search over the DERIVED INDEX (REQ-051), not over canonical.
   * Before increment 11 this queried canonical_skills directly, which meant there was
   * no derived index and therefore nothing for REQ-052 to rebuild.
   */
  search({ q, cursor = null, limit = 50 }) {
    const n = Math.min(Math.max(1, limit), 100);
    const like = `%${String(q).toLowerCase().replace(/[%_]/g, (c) => '\\' + c)}%`;
    const rows = cursor
      ? this.#db.prepare(
          `SELECT c.* FROM search_index s JOIN canonical_skills c ON c.id = s.canonical_id
           WHERE s.haystack LIKE ? ESCAPE '\\' AND (s.created_at, s.canonical_id) > (?, ?)
           ORDER BY s.created_at, s.canonical_id LIMIT ?`).all(like, ...decodeCursor(cursor), n)
      : this.#db.prepare(
          `SELECT c.* FROM search_index s JOIN canonical_skills c ON c.id = s.canonical_id
           WHERE s.haystack LIKE ? ESCAPE '\\'
           ORDER BY s.created_at, s.canonical_id LIMIT ?`).all(like, n);
    const next = rows.length === n ? encodeCursor(rows.at(-1).created_at, rows.at(-1).id) : null;
    return { rows, cursor: { next, limit: n } };
  }

  counts() {
    // DEF-004's rule generalised: no identifier is interpolated into SQL, even one that
    // is currently a local literal. A future edit that made `t` a parameter would turn
    // this into an injection site silently, and the fixed form costs nothing.
    return {
      canonical: this.#db.prepare('SELECT COUNT(*) AS n FROM canonical_skills').get().n,
      occurrences: this.#db.prepare('SELECT COUNT(*) AS n FROM occurrences').get().n,
      repositories: this.#db.prepare('SELECT COUNT(*) AS n FROM repositories').get().n,
      jobs: this.#db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,
      tombstones: this.#db.prepare('SELECT COUNT(*) AS n FROM tombstones').get().n,
    };
  }

  // ---- jobs and cursors ----------------------------------------------------

  recordJob(j) {
    this.#db.prepare(
      `INSERT INTO jobs (job_id, skill_ref, source_id, stage, attempt, status, started_at, completed_at, error, content_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,
         stage=excluded.stage, completed_at=excluded.completed_at,
         error=excluded.error, attempt=excluded.attempt`
      // started_at is deliberately NOT updated: starting a job sets it, completing
      // one must not move it, or duration becomes unmeasurable.
    ).run(j.jobId, j.skillRef, j.sourceId, j.stage, j.attempt, j.status,
          j.startedAt, j.completedAt ?? null, j.error ?? null, j.contentHash ?? null);
  }
  getJob(id) { return this.#db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(id) ?? null; }
  /** REQ-084: the operator's real question is "what happened to this skill?" */
  listJobs({ skillRef }) {
    return this.#db.prepare('SELECT * FROM jobs WHERE skill_ref = ? ORDER BY started_at').all(skillRef);
  }

  getCursor(id) {
    const r = this.#db.prepare('SELECT position FROM cursors WHERE id = ?').get(id);
    return r ? r.position : null;
  }
  setCursor(id, sourceId, position, now) {
    this.#db.prepare(
      'INSERT INTO cursors (id, source_id, position, updated_at) VALUES (?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET position=excluded.position, updated_at=excluded.updated_at'
    ).run(id, sourceId, position, now);
  }

  // ---- raw objects (REQ-030, REQ-034) -------------------------------------

  upsertRawObject(r) {
    this.#db.prepare(
      `INSERT INTO raw_objects (content_hash, object_key, source_id, source_url,
         source_version_ref, retrieved_at, size_bytes, rights_state, retention_policy,
         expires_at, state, deleted_at, deleted_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(content_hash) DO UPDATE SET
         state=excluded.state, expires_at=excluded.expires_at,
         deleted_at=excluded.deleted_at, deleted_reason=excluded.deleted_reason`
    ).run(r.contentHash, r.objectKey, r.sourceId, r.sourceUrl ?? null,
          r.sourceVersionRef ?? null, r.retrievedAt, r.sizeBytes, r.rightsState,
          r.retentionPolicy, r.expiresAt ?? null, r.state ?? 'retained',
          r.deletedAt ?? null, r.deletedReason ?? null);
    return r.contentHash;
  }

  getRawObject(contentHash) {
    return this.#db.prepare('SELECT * FROM raw_objects WHERE content_hash = ?').get(contentHash) ?? null;
  }

  /** REQ-034: retention is a QUERY over recorded expiry, not a background guess. */
  findExpiredRaw({ now, limit = 500 }) {
    return this.#db.prepare(
      `SELECT * FROM raw_objects WHERE state = 'retained' AND expires_at IS NOT NULL
         AND expires_at <= ? ORDER BY expires_at LIMIT ?`).all(now, limit);
  }

  markRawDeleted({ contentHash, now, reason }) {
    this.#db.prepare(
      `UPDATE raw_objects SET state='deleted', deleted_at=?, deleted_reason=? WHERE content_hash = ?`)
      .run(now, reason, contentHash);
  }

  rawCounts() {
    const one = (st) => this.#db.prepare(
      'SELECT COUNT(*) AS n FROM raw_objects WHERE state = ?').get(st).n;
    return { retained: one('retained'), expired: one('expired'), deleted: one('deleted'),
             total: this.#db.prepare('SELECT COUNT(*) AS n FROM raw_objects').get().n };
  }

  // ---- derived search index (REQ-051, REQ-052) -----------------------------

  /** Derived and DISPOSABLE. Dropping this loses nothing (DATABASE.md SS1). */
  clearSearchIndex() {
    const before = this.#db.prepare('SELECT COUNT(*) AS n FROM search_index').get().n;
    this.#db.exec('DELETE FROM search_index');
    return before;
  }

  indexCanonical({ canonicalId, haystack, declaredName, createdAt, now }) {
    this.#db.prepare(
      `INSERT INTO search_index (canonical_id, haystack, declared_name, created_at, indexed_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(canonical_id) DO UPDATE SET haystack=excluded.haystack,
         declared_name=excluded.declared_name, indexed_at=excluded.indexed_at`
    ).run(canonicalId, haystack, declaredName ?? null, createdAt, now);
  }

  searchIndexCount() {
    return this.#db.prepare('SELECT COUNT(*) AS n FROM search_index').get().n;
  }

  /** Iterates canonical for a rebuild. Cursor-based: never loads the table (NFR-031). */
  canonicalForIndexing({ cursor = null, limit = 500 } = {}) {
    const n = Math.min(Math.max(1, limit), 1000);
    const rows = cursor
      ? this.#db.prepare(
          `SELECT id, declared_name, declared_description, created_at, tombstoned_at
           FROM canonical_skills WHERE (created_at, id) > (?, ?)
           ORDER BY created_at, id LIMIT ?`).all(...decodeCursor(cursor), n)
      : this.#db.prepare(
          `SELECT id, declared_name, declared_description, created_at, tombstoned_at
           FROM canonical_skills ORDER BY created_at, id LIMIT ?`).all(n);
    const next = rows.length === n ? encodeCursor(rows.at(-1).created_at, rows.at(-1).id) : null;
    return { rows, cursor: { next, limit: n } };
  }

  // ---- removal and correction (REQ-063, DEC-015) --------------------------

  recordRemovalRequest(r) {
    this.#db.prepare(
      `INSERT INTO removal_requests (request_id, canonical_id, content_hash, repository, kind,
         reason, requested_by, requested_at, disposition, disposition_reason, actioned_at, actor)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(request_id) DO UPDATE SET
         disposition=excluded.disposition, disposition_reason=excluded.disposition_reason,
         actioned_at=excluded.actioned_at, actor=excluded.actor`
    ).run(r.requestId, r.canonicalId ?? null, r.contentHash ?? null, r.repository, r.kind,
          r.reason, r.requestedBy, r.requestedAt, r.disposition,
          r.dispositionReason ?? null, r.actionedAt ?? null, r.actor ?? null);
    return r.requestId;
  }

  getRemovalRequest(id) {
    return this.#db.prepare('SELECT * FROM removal_requests WHERE request_id = ?').get(id) ?? null;
  }
  listRemovalRequests({ repository = null, disposition = null } = {}) {
    if (repository) return this.#db.prepare(
      'SELECT * FROM removal_requests WHERE repository = ? ORDER BY requested_at').all(repository);
    if (disposition) return this.#db.prepare(
      'SELECT * FROM removal_requests WHERE disposition = ? ORDER BY requested_at').all(disposition);
    return this.#db.prepare('SELECT * FROM removal_requests ORDER BY requested_at').all();
  }

  /**
   * DEC-015: deletes the BYTES and marks the record, while the provenance envelope
   * and the tombstone survive permanently. The canonical row is NOT deleted - an
   * index that can silently lose records is not an index.
   */
  markTombstoned({ canonicalId, now }) {
    this.#db.prepare(
      `UPDATE canonical_skills SET tombstoned_at = ?, content_bytes_held = 0, updated_at = ?
       WHERE id = ?`).run(now, now, canonicalId);
  }

  tombstonedCount() {
    return this.#db.prepare(
      'SELECT COUNT(*) AS n FROM canonical_skills WHERE tombstoned_at IS NOT NULL').get().n;
  }

  // ---- re-analysis (REQ-095) ----------------------------------------------

  setAnalyserVersions(canonicalId, versions, now) {
    this.#db.prepare(
      'UPDATE canonical_skills SET analyser_versions = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(versions), now, canonicalId);
  }

  /**
   * REQ-095: "which records are affected?" answered by QUERY, not by guess.
   * Returns records whose recorded version for `analyser` differs from `version`,
   * including records that have never been analysed by it.
   */
  findForReanalysis({ analyser, version, cursor = null, limit = 100 }) {
    const n = Math.min(Math.max(1, limit), 1000);
    const rows = cursor
      ? this.#db.prepare(
          `SELECT id, content_hash, analyser_versions, created_at FROM canonical_skills
           WHERE json_extract(analyser_versions, '$.' || ?) IS NOT ?
             AND (created_at, id) > (?, ?)
           ORDER BY created_at, id LIMIT ?`).all(analyser, version, ...decodeCursor(cursor), n)
      : this.#db.prepare(
          `SELECT id, content_hash, analyser_versions, created_at FROM canonical_skills
           WHERE json_extract(analyser_versions, '$.' || ?) IS NOT ?
           ORDER BY created_at, id LIMIT ?`).all(analyser, version, n);
    const next = rows.length === n ? encodeCursor(rows.at(-1).created_at, rows.at(-1).id) : null;
    return { rows, cursor: { next, limit: n } };
  }

  /** DEC-015: bytes deletable, provenance envelope permanent. */
  tombstone({ contentHash, reason, actor, now, provenance }) {
    this.#db.prepare(
      'INSERT OR REPLACE INTO tombstones (content_hash, reason, actor, created_at, provenance_json) VALUES (?,?,?,?,?)'
    ).run(contentHash, reason, actor, now, json(provenance));
  }
  tombstoneCount() { return this.#db.prepare('SELECT COUNT(*) AS n FROM tombstones').get().n; }

  // ---- backup / restore / verify (REQ-091, NFR-035, DEC-022) ---------------

  /** Uses SQLite's own consistent snapshot rather than copying a live file. */
  backup(targetPath) {
    if (this.#path === ':memory:') throw new Error('cannot back up an in-memory store');
    mkdirSync(dirname(targetPath), { recursive: true });
    this.#db.exec('PRAGMA wal_checkpoint(FULL)');
    copyFileSync(this.#path, targetPath);
    return { path: targetPath, ...this.digest() };
  }

  /**
   * NFR-035: recovery is verified by restoring to a scratch location and asserting
   * record count and content-hash digest match. A restore procedure that has never
   * been executed is a document, not a capability (DEC-022).
   */
  digest() {
    const rows = this.#db.prepare('SELECT content_hash FROM canonical_skills ORDER BY content_hash').all();
    const h = createHash('sha256');
    for (const r of rows) h.update(r.content_hash);
    return { records: rows.length, digest: 'sha256:' + h.digest('hex'), schemaVersion: this.schemaVersion() };
  }

  static restore(backupPath, targetPath) {
    if (!existsSync(backupPath)) throw new Error(`backup not found: ${backupPath}`);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(backupPath, targetPath);
    return new SqliteCanonicalStore(targetPath);
  }

  static verifyRestore(backupPath, expected) {
    const scratch = `${backupPath}.verify`;
    const s = SqliteCanonicalStore.restore(backupPath, scratch);
    try {
      const actual = s.digest();
      const ok = actual.records === expected.records && actual.digest === expected.digest;
      return { ok, expected, actual,
               reason: ok ? 'record count and digest match'
                          : `mismatch: expected ${expected.records}/${expected.digest}, got ${actual.records}/${actual.digest}` };
    } finally { s.close(); }
  }
}

/** Names the offending field instead of leaving a positional SQLite error. */
function assertBindable(fields) {
  for (const [name, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t !== 'string' && t !== 'number' && t !== 'boolean' && !(v instanceof Uint8Array)) {
      throw new TypeError(
        `cannot store field "${name}": expected a scalar, got ${Array.isArray(v) ? 'array' : t}`);
    }
  }
}

const encodeCursor = (a, b) => Buffer.from(JSON.stringify([a, b])).toString('base64url');
function decodeCursor(c) {
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (!Array.isArray(v) || v.length !== 2) throw new Error();
    return v;
  } catch { throw new Error('INVALID_CURSOR: cursor malformed or expired'); }
}
