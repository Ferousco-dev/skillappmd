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
  #migrationLog = [];

  schemaVersion() { return this.#version; }

  migrate({ now }) {
    if (typeof now !== 'string') throw new TypeError('migrate requires an explicit UTC timestamp (NFR-038)');
    const from = this.#version;
    const applied = [];
    for (const v of [1, 2]) {
      if (v <= from) continue;
      this.#version = v; applied.push(v);
      this.#migrationLog.push({ version: v, name: `memory-v${v}`, applied_at: now, rows_touched: 0 });
    }
    return { from, to: this.#version, applied };
  }
  migrationLog() { return [...this.#migrationLog]; }

  upsertSource({ id, accessPolicy, now }) {
    this.#sources.set(id, { id, access_policy: JSON.stringify(accessPolicy), registered_at: now });
  }
  getSource(id) { return this.#sources.get(id) ?? null; }
  upsertRepository() { /* repositories are not queried by the contract suite */ }

  upsertCanonical(c) {
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

  findByContentHash(h) { const id = this.#byContent.get(h); return id ? clone(this.#canonical.get(id)) : null; }
  findByNormalisedHash(h) { const id = this.#byNormalised.get(h); return id ? clone(this.#canonical.get(id)) : null; }
  getCanonical(id) { const r = this.#canonical.get(id); return r ? clone(r) : null; }

  upsertOccurrence(o) {
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
  cursorScan({ cursor = null, limit = 50 } = {}) {
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

  listOccurrences({ canonicalId, cursor = null, limit = 50 } = {}) {
    const n = Math.min(Math.max(1, limit), 100);
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#occurrences.values()]
      .filter((o) => o.canonical_id === canonicalId)
      .sort((a, b) => a.occurrence_key.localeCompare(b.occurrence_key));
    const start = after === null ? 0 : all.findIndex((o) => o.occurrence_key > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    return { rows, cursor: { next: rows.length === n ? encode(rows.at(-1).occurrence_key) : null, limit: n } };
  }

  search({ q, cursor = null, limit = 50 }) {
    const term = String(q).toLowerCase();
    const n = Math.min(Math.max(1, limit), 100);
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#canonical.values()]
      .filter((r) => `${r.declared_name ?? ''} ${r.declared_description ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id));
    const start = after === null ? 0 : all.findIndex((r) => (r.created_at + r.id) > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    return { rows, cursor: { next: rows.length === n ? encode(rows.at(-1).created_at + rows.at(-1).id) : null, limit: n } };
  }

  counts() {
    return { canonical: this.#canonical.size, occurrences: this.#occurrences.size,
             repositories: 0, jobs: this.#jobs.size, tombstones: this.#tombstones.size };
  }

  recordJob(j) {
    const prev = this.#jobs.get(j.jobId);
    this.#jobs.set(j.jobId, { job_id: j.jobId, skill_ref: j.skillRef, source_id: j.sourceId,
      stage: j.stage, attempt: j.attempt, status: j.status,
      started_at: prev?.started_at ?? j.startedAt,   // starting sets it; completing must not move it
      completed_at: j.completedAt ?? null, error: j.error ?? null, content_hash: j.contentHash ?? null });
  }
  getJob(id) { const j = this.#jobs.get(id); return j ? clone(j) : null; }
  listJobs({ skillRef }) {
    return [...this.#jobs.values()].filter((j) => j.skill_ref === skillRef)
      .sort((a, b) => a.started_at.localeCompare(b.started_at)).map(clone);
  }

  getCursor(id) { return this.#cursors.get(id) ?? null; }
  setCursor(id, _src, position) { this.#cursors.set(id, position); }

  tombstone({ contentHash, reason, actor, now, provenance }) {
    this.#tombstones.set(contentHash, { content_hash: contentHash, reason, actor,
      created_at: now, provenance_json: JSON.stringify(provenance) });
  }
  tombstoneCount() { return this.#tombstones.size; }
  markTombstoned({ canonicalId, now }) {
    const r = this.#canonical.get(canonicalId);
    if (r) { r.tombstoned_at = now; r.content_bytes_held = 0; r.updated_at = now; }
  }
  tombstonedCount() { return [...this.#canonical.values()].filter((r) => r.tombstoned_at).length; }

  recordRemovalRequest(r) {
    const prev = this.#removals.get(r.requestId) ?? {};
    this.#removals.set(r.requestId, { ...prev,
      request_id: r.requestId, canonical_id: r.canonicalId ?? null, content_hash: r.contentHash ?? null,
      repository: r.repository, kind: r.kind, reason: r.reason, requested_by: r.requestedBy,
      requested_at: r.requestedAt, disposition: r.disposition,
      disposition_reason: r.dispositionReason ?? null, actioned_at: r.actionedAt ?? null,
      actor: r.actor ?? null });
    return r.requestId;
  }
  getRemovalRequest(id) { const r = this.#removals.get(id); return r ? clone(r) : null; }
  listRemovalRequests({ repository = null, disposition = null } = {}) {
    return [...this.#removals.values()]
      .filter((r) => (!repository || r.repository === repository) &&
                     (!disposition || r.disposition === disposition))
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at)).map(clone);
  }

  setAnalyserVersions(id, versions) {
    const r = this.#canonical.get(id);
    if (r) r.analyser_versions = JSON.stringify(versions);
  }
  findForReanalysis({ analyser, version, cursor = null, limit = 100 }) {
    const n = Math.min(Math.max(1, limit), 1000);
    const after = cursor === null ? null : decode(cursor);
    const all = [...this.#canonical.values()]
      .filter((r) => (JSON.parse(r.analyser_versions ?? '{}')[analyser] ?? null) !== version)
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id));
    const start = after === null ? 0 : all.findIndex((r) => (r.created_at + r.id) > after);
    const rows = start < 0 ? [] : all.slice(start, start + n).map(clone);
    return { rows, cursor: { next: rows.length === n ? encode(rows.at(-1).created_at + rows.at(-1).id) : null, limit: n } };
  }

  digest() {
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
