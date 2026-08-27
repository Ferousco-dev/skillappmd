/**
 * MemoryCanonicalStore - a CanonicalStore adapter built from plain JavaScript maps.
 * DES-029. Contains NO SQL, NO schema, NO query language of any kind.
 *
 * WHY THIS EXISTS. DEC-027 stakes the whole storage strategy on being able to swap
 * the canonical store later. DATABASE.md SS8 states the falsifiable test: a second
 * adapter can be written and the full suite pass WITHOUT editing skill-core or
 * ingestion. If that is not true, DEC-027's migration path is fiction.
 *
 * A Postgres adapter would prove less than this one does. Postgres and SQLite share
 * SQL, so a port that leaked SQL would still pass. This adapter shares NOTHING with
 * the SQLite adapter except the port - which is exactly the property under test.
 */
import { createHash } from 'node:crypto';

const clone = (o) => JSON.parse(JSON.stringify(o));

export class MemoryCanonicalStore {
  #version = 0;
  #canonical = new Map();      // id -> row
  #byContent = new Map();      // content_hash -> id
  #byNormalised = new Map();   // normalised_hash -> id
  #occurrences = new Map();    // key -> row
  #sources = new Map();
  #jobs = new Map();
  #cursors = new Map();
  #tombstones = new Map();
  #removals = new Map();
  #raw = new Map();
  #index = new Map();
  #migrationLog = [];

  async schemaVersion() { return this.#version; }

  async migrate({ now }) {
    if (typeof now !== 'string') throw new TypeError('migrate requires an explicit UTC timestamp (NFR-038)');
    const from = this.#version;
    const applied = [];
    for (const v of [1, 2, 3]) {
      if (v <= from) continue;
      this.#version = v; applied.push(v);
      this.#migrationLog.push({ version: v, name: `memory-v${v}`, applied_at: now, rows_touched: 0 });
    }
    return { from, to: this.#version, applied };
  }
  async migrationLog() { return [...this.#migrationLog]; }

  async upsertSource({ id, accessPolicy, now }) {
    this.#sources.set(id, { id, access_policy: JSON.stringify(accessPolicy), registered_at: now });
  }
  async getSource(id) { return this.#sources.get(id) ?? null; }
  async upsertRepository() { /* repositories are not queried by the contract suite */ }

  async upsertCanonical(c) {
    // NFR-004 / NFR-006 enforced here too: the invariant belongs to the DOMAIN, so
    // every adapter must uphold it, not just the one with CHECK constraints (DEC-031).
    for (const f of ['repository', 'owner', 'canonical_source_url']) {
      if (!c.attribution?.[f]) throw new Error(`CHECK constraint failed: attribution.${f} is required`);
    }
    if (c.rights.redistributable && c.rights.state !== 'known') {
      throw new Error('CHECK constraint failed: redistributable requires known rights');
    }
    for (const [name, v] of Object.entries({ 'declared.name': c.declared?.name,
                                             'declared.description': c.declared?.description })) {
      if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        throw new TypeError(`cannot store field "${name}": expected a scalar, got ${Array.isArray(v) ? 'array' : typeof v}`);
      }
    }

    const existingId = this.#byContent.get(c.contentHash);
    const id = existingId ?? c.id;
    const prev = this.#canonical.get(id);
    const row = {
      id, schema_version: c.schemaVersion ?? this.#version,
      content_hash: c.contentHash, normalised_hash: c.normalisedHash, partition_key: c.partitionKey,
      declared_name: c.declared?.name ?? null, declared_description: c.declared?.description ?? null,
      frontmatter_valid: c.frontmatterValid ? 1 : 0,
      declared_json: JSON.stringify(c.declared ?? {}),
      inferred_json: JSON.stringify(c.inferred ?? {}),
      licence_json: JSON.stringify(c.licence), rights_state: c.rights.state,
      rights_redistributable: c.rights.redistributable ? 1 : 0,
      rights_json: JSON.stringify(c.rights), retention_policy: c.retentionPolicy,
      provenance_json: JSON.stringify(c.provenance),
      attribution_repository: c.attribution.repository, attribution_owner: c.attribution.owner,
      attribution_url: c.attribution.canonical_source_url,
      first_commit_at: c.temporal?.first_commit_at ?? null,
      last_commit_at: c.temporal?.last_commit_at ?? null,
      discovered_at: c.temporal?.discovered_at ?? c.now,
      last_verified_at: c.temporal?.last_verified_at ?? null,
      created_at: prev?.created_at ?? c.now, updated_at: c.now,
      analyser_versions: prev?.analyser_versions ?? '{}',
      tombstoned_at: prev?.tombstoned_at ?? null,
      content_bytes_held: prev?.content_bytes_held ?? 1,
    };
    this.#canonical.set(id, row);
    this.#byContent.set(c.contentHash, id);
    if (!this.#byNormalised.has(c.normalisedHash)) this.#byNormalised.set(c.normalisedHash, id);
    return id;
  }

  async findByContentHash(h) { const id = this.#byContent.get(h); return id ? clone(this.#canonical.get(id)) : null; }
  async findByNormalisedHash(h) { const id = this.#byNormalised.get(h); return id ? clone(this.#canonical.get(id)) : null; }
  async getCanonical(id) { const r = this.#canonical.get(id); return r ? clone(r) : null; }

  async upsertOccurrence(o) {
    const prev = this.#occurrences.get(o.occurrenceKey) ?? {};
    this.#occurrences.set(o.occurrenceKey, { ...prev,
      occurrence_key: o.occurrenceKey, source_id: o.sourceId, repo_full_name: o.repoFullName,
      path: o.path, content_hash: o.contentHash, normalised_hash: o.normalisedHash,
      canonical_id: o.canonicalId ?? null, relationship: o.relationship ?? null,
      relationship_reason: o.relationshipReason ?? null, source_version_ref: o.sourceVersionRef ?? null,
      file_sha: o.fileSha ?? null, raw_object_key: o.rawObjectKey ?? null,
      discovered_at: o.discoveredAt, stage: o.stage });
    return o.occurrenceKey;
  }

  /** Cursor semantics identical to the SQL adapter, implemented by sorting a list. */
  async cursorScan({ cursor = null, limit = 50 } = {}) {
    const n = Math.min(Math.max(1, limit), 100);
    // Decoded EAGERLY: validating inside the findIndex callback meant an empty store
    // never validated the cursor at all (TC-201).
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#canonical.values()]
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id));
    const start = after === null ? 0 : all.findIndex((r) => (r.created_at + r.id) > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    const next = rows.length === n ? encode(rows.at(-1).created_at + rows.at(-1).id) : null;
    return { rows, cursor: { next, limit: n } };
  }

  async listOccurrences({ canonicalId, cursor = null, limit = 50 } = {}) {
    const n = Math.min(Math.max(1, limit), 100);
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#occurrences.values()]
      .filter((o) => o.canonical_id === canonicalId)
      .sort((a, b) => a.occurrence_key.localeCompare(b.occurrence_key));
    const start = after === null ? 0 : all.findIndex((o) => o.occurrence_key > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    return { rows, cursor: { next: rows.length === n ? encode(rows.at(-1).occurrence_key) : null, limit: n } };
  }

  /** Reads the DERIVED INDEX, matching the SQL adapter's semantics exactly. */
  async search({ q, cursor = null, limit = 50 }) {
    const term = String(q).toLowerCase();
    const n = Math.min(Math.max(1, limit), 100);
    const after = cursor === null ? null : decode(cursor);
    const hits = [...this.#index.values()]
      .filter((e) => e.haystack.includes(term))
      .sort((a, b) => (a.created_at + a.canonical_id).localeCompare(b.created_at + b.canonical_id));
    const start = after === null ? 0 : hits.findIndex((e) => (e.created_at + e.canonical_id) > after);
    const page = start < 0 ? [] : hits.slice(start, start + n);
    const rows = page.map((e) => clone(this.#canonical.get(e.canonical_id))).filter(Boolean);
    const last = page.at(-1);
    return { rows, cursor: { next: page.length === n ? encode(last.created_at + last.canonical_id) : null, limit: n } };
  }

  async counts() {
    return { canonical: this.#canonical.size, occurrences: this.#occurrences.size,
             repositories: 0, jobs: this.#jobs.size, tombstones: this.#tombstones.size };
  }

  async recordJob(j) {
    const prev = this.#jobs.get(j.jobId);
    this.#jobs.set(j.jobId, { job_id: j.jobId, skill_ref: j.skillRef, source_id: j.sourceId,
      stage: j.stage, attempt: j.attempt, status: j.status,
      started_at: prev?.started_at ?? j.startedAt,   // starting sets it; completing must not move it
      completed_at: j.completedAt ?? null, error: j.error ?? null, content_hash: j.contentHash ?? null });
  }
  async getJob(id) { const j = this.#jobs.get(id); return j ? clone(j) : null; }
  async listJobs({ skillRef }) {
    return [...this.#jobs.values()].filter((j) => j.skill_ref === skillRef)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)).map(clone);
  }

  async getCursor(id) { return this.#cursors.get(id) ?? null; }
  async setCursor(id, _src, position) { this.#cursors.set(id, position); }

  async tombstone({ contentHash, reason, actor, now, provenance }) {
    this.#tombstones.set(contentHash, { content_hash: contentHash, reason, actor,
      created_at: now, provenance_json: JSON.stringify(provenance) });
  }
  async tombstoneCount() { return this.#tombstones.size; }
  async markTombstoned({ canonicalId, now }) {
    const r = this.#canonical.get(canonicalId);
    if (r) { r.tombstoned_at = now; r.content_bytes_held = 0; r.updated_at = now; }
  }
  async tombstonedCount() { return [...this.#canonical.values()].filter((r) => r.tombstoned_at).length; }

  async recordRemovalRequest(r) {
    const prev = this.#removals.get(r.requestId) ?? {};
    this.#removals.set(r.requestId, { ...prev,
      request_id: r.requestId, canonical_id: r.canonicalId ?? null, content_hash: r.contentHash ?? null,
      repository: r.repository, kind: r.kind, reason: r.reason, requested_by: r.requestedBy,
      requested_at: r.requestedAt, disposition: r.disposition,
      disposition_reason: r.dispositionReason ?? null, actioned_at: r.actionedAt ?? null,
      actor: r.actor ?? null });
    return r.requestId;
  }
  async getRemovalRequest(id) { const r = this.#removals.get(id); return r ? clone(r) : null; }
  async listRemovalRequests({ repository = null, disposition = null } = {}) {
    return [...this.#removals.values()]
      .filter((r) => (!repository || r.repository === repository) &&
                     (!disposition || r.disposition === disposition))
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at)).map(clone);
  }

  async setAnalyserVersions(id, versions) {
    const r = this.#canonical.get(id);
    if (r) r.analyser_versions = JSON.stringify(versions);
  }
  async findForReanalysis({ analyser, version, cursor = null, limit = 100 }) {
    const n = Math.min(Math.max(1, limit), 1000);
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#canonical.values()]
      .filter((r) => (JSON.parse(r.analyser_versions ?? '{}')[analyser] ?? null) !== version)
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id));
    const start = after === null ? 0 : all.findIndex((r) => (r.created_at + r.id) > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    return { rows, cursor: { next: rows.length === n ? encode(rows.at(-1).created_at + rows.at(-1).id) : null, limit: n } };
  }

  // ---- raw objects + derived index parity (increment 11) -------------------

  async upsertRawObject(r) {
    const prev = this.#raw.get(r.contentHash);
    this.#raw.set(r.contentHash, { ...prev,
      content_hash: r.contentHash, object_key: r.objectKey, source_id: r.sourceId,
      source_url: r.sourceUrl ?? null, source_version_ref: r.sourceVersionRef ?? null,
      retrieved_at: r.retrievedAt, size_bytes: r.sizeBytes, rights_state: r.rightsState,
      retention_policy: r.retentionPolicy, expires_at: r.expiresAt ?? null,
      state: r.state ?? prev?.state ?? 'retained',
      deleted_at: r.deletedAt ?? prev?.deleted_at ?? null,
      deleted_reason: r.deletedReason ?? prev?.deleted_reason ?? null });
    return r.contentHash;
  }
  async getRawObject(h) { const r = this.#raw.get(h); return r ? clone(r) : null; }
  async findExpiredRaw({ now, limit = 500 }) {
    return [...this.#raw.values()]
      .filter((r) => r.state === 'retained' && r.expires_at && r.expires_at <= now)
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at)).slice(0, limit).map(clone);
  }
  async markRawDeleted({ contentHash, now, reason }) {
    const r = this.#raw.get(contentHash);
    if (r) { r.state = 'deleted'; r.deleted_at = now; r.deleted_reason = reason; }
  }
  async rawCounts() {
    const c = (st) => [...this.#raw.values()].filter((r) => r.state === st).length;
    return { retained: c('retained'), expired: c('expired'), deleted: c('deleted'), total: this.#raw.size };
  }

  async clearSearchIndex() { const n = this.#index.size; this.#index.clear(); return n; }
  async indexCanonical({ canonicalId, haystack, declaredName, createdAt, now }) {
    this.#index.set(canonicalId, { canonical_id: canonicalId, haystack,
      declared_name: declaredName ?? null, created_at: createdAt, indexed_at: now });
  }
  async searchIndexCount() { return this.#index.size; }
  async canonicalForIndexing({ cursor = null, limit = 500 } = {}) {
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#canonical.values()]
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id));
    const start = after === null ? 0 : all.findIndex((r) => (r.created_at + r.id) > after);
    const rows = (start < 0 ? [] : all.slice(start, start + limit)).map((r) => ({
      id: r.id, declared_name: r.declared_name, declared_description: r.declared_description,
      created_at: r.created_at, tombstoned_at: r.tombstoned_at }));
    return { rows, cursor: { next: rows.length === limit ? encode(rows.at(-1).created_at + rows.at(-1).id) : null, limit } };
  }

  async digest() {
    const hashes = [...this.#canonical.values()].map((r) => r.content_hash).sort();
    const h = createHash('sha256');
    for (const x of hashes) h.update(x);
    return { records: hashes.length, digest: 'sha256:' + h.digest('hex'), schemaVersion: this.#version };
  }

  close() { /* nothing to release */ }
}

/**
 * TC-201 caught a real divergence: this adapter originally base64-decoded any string
 * without validating it, so a malformed cursor silently became a garbage sort key
 * instead of raising INVALID_CURSOR. The SQL adapter validated structure; this one
 * did not. Same interface, different behaviour - which is precisely the class of bug
 * the cross-adapter contract suite exists to catch, and which a Postgres adapter
 * (sharing SQL and therefore the same cursor code path) would never have exposed.
 *
 * Both adapters now encode a JSON tuple and reject anything that is not one.
 */
const encode = (s) => Buffer.from(JSON.stringify(['', String(s)])).toString('base64url');
function decode(c) {
  let v;
  try { v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')); }
  catch { throw new Error('INVALID_CURSOR: cursor malformed or expired'); }
  if (!Array.isArray(v) || v.length !== 2) {
    throw new Error('INVALID_CURSOR: cursor malformed or expired');
  }
  return v[1];
}
