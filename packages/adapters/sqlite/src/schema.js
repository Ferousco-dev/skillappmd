/**
 * Canonical schema. DES-033. REQ-050, REQ-053, REQ-055, REQ-094.
 *
 * Dialect note: SQLite is chosen deliberately so the local adapter and the D1
 * production adapter share a dialect (DEC-027). Everything here must remain
 * expressible in D1.
 *
 * DEC-026: provenance is a JSON column, not one row per field origin.
 * Measured: as rows it is 44% of all relational storage; as JSON the full corpus
 * drops 7.65 GB -> ~4.3 GB and D1 headroom roughly doubles.
 */

export const SCHEMA_VERSION = 2;

/**
 * REQ-094: migrations are ordered, re-runnable, and record what they touched.
 * A migration that cannot preserve a field FAILS rather than dropping it.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-canonical-schema',
    up: [
      `CREATE TABLE IF NOT EXISTS schema_meta (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         version INTEGER NOT NULL,
         applied_at TEXT NOT NULL
       )`,

      // DES-002 / DOM-012: access policy is DATA, not code.
      `CREATE TABLE IF NOT EXISTS sources (
         id TEXT PRIMARY KEY,
         access_policy TEXT NOT NULL,
         registered_at TEXT NOT NULL
       )`,

      // DOM-009 attribution unit + L2 licence holder. DOM-013 identity class.
      `CREATE TABLE IF NOT EXISTS repositories (
         full_name TEXT PRIMARY KEY,
         owner TEXT NOT NULL,
         identity_class TEXT NOT NULL,
         stars INTEGER, forks INTEGER, is_fork INTEGER NOT NULL DEFAULT 0,
         language TEXT, licence_raw TEXT, licence_spdx TEXT,
         created_at TEXT, pushed_at TEXT,
         first_seen_at TEXT NOT NULL
       )`,

      // DOM-002. Identity, never derived from mutable data.
      `CREATE TABLE IF NOT EXISTS canonical_skills (
         id TEXT PRIMARY KEY,
         schema_version INTEGER NOT NULL,
         content_hash TEXT NOT NULL UNIQUE,
         normalised_hash TEXT NOT NULL,
         partition_key TEXT NOT NULL,              -- NFR-033
         declared_name TEXT, declared_description TEXT,
         frontmatter_valid INTEGER,
         declared_json TEXT NOT NULL,
         inferred_json TEXT NOT NULL DEFAULT '{}', -- empty in Phase 1; shape exists (ARCHITECTURE.md §6)
         licence_json TEXT NOT NULL,
         rights_state TEXT NOT NULL,               -- DEC-018: queryable, explicit
         rights_redistributable INTEGER NOT NULL,
         rights_json TEXT NOT NULL,
         retention_policy TEXT NOT NULL,
         provenance_json TEXT NOT NULL,            -- DEC-026
         -- NFR-004: attribution is a WRITE-TIME invariant, enforced here too.
         attribution_repository TEXT NOT NULL CHECK (attribution_repository <> ''),
         attribution_owner TEXT NOT NULL CHECK (attribution_owner <> ''),
         attribution_url TEXT NOT NULL CHECK (attribution_url <> ''),
         first_commit_at TEXT, last_commit_at TEXT,
         discovered_at TEXT NOT NULL, last_verified_at TEXT,
         created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
         -- NFR-006, as a database constraint rather than a hope.
         CHECK (rights_redistributable = 0 OR rights_state = 'known')
       )`,

      // DOM-001: an observation, never an identity. REQ-046: evidence survives dedup.
      `CREATE TABLE IF NOT EXISTS occurrences (
         occurrence_key TEXT PRIMARY KEY,
         source_id TEXT NOT NULL,
         repo_full_name TEXT NOT NULL,
         path TEXT NOT NULL,
         content_hash TEXT NOT NULL,
         normalised_hash TEXT NOT NULL,
         canonical_id TEXT,
         relationship TEXT,
         relationship_reason TEXT,
         source_version_ref TEXT,
         file_sha TEXT,                            -- DEC-012: source fact, never identity
         raw_object_key TEXT,
         discovered_at TEXT NOT NULL,
         stage TEXT NOT NULL,
         FOREIGN KEY (canonical_id) REFERENCES canonical_skills(id)
       )`,

      `CREATE TABLE IF NOT EXISTS jobs (
         job_id TEXT PRIMARY KEY,
         skill_ref TEXT NOT NULL, source_id TEXT NOT NULL,
         stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
         started_at TEXT NOT NULL, completed_at TEXT, error TEXT,
         content_hash TEXT
       )`,

      `CREATE TABLE IF NOT EXISTS cursors (
         id TEXT PRIMARY KEY, source_id TEXT NOT NULL,
         position TEXT NOT NULL, updated_at TEXT NOT NULL
       )`,

      // DEC-015: bytes are deletable; the provenance envelope is permanent.
      `CREATE TABLE IF NOT EXISTS tombstones (
         content_hash TEXT PRIMARY KEY,
         reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
         provenance_json TEXT NOT NULL
       )`,

      `CREATE TABLE IF NOT EXISTS migration_log (
         version INTEGER NOT NULL, name TEXT NOT NULL,
         applied_at TEXT NOT NULL, rows_touched INTEGER NOT NULL,
         PRIMARY KEY (version, applied_at)
       )`,

      // Indexes. DEDUPLICATION.md §6: the content_hash probe is the hottest
      // read on the write path - once per occurrence, 3.8M times per full pass.
      `CREATE INDEX IF NOT EXISTS idx_occ_content ON occurrences(content_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_occ_norm ON occurrences(normalised_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_occ_canonical ON occurrences(canonical_id)`,
      `CREATE INDEX IF NOT EXISTS idx_occ_repo ON occurrences(repo_full_name)`,
      `CREATE INDEX IF NOT EXISTS idx_cs_norm ON canonical_skills(normalised_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_cs_partition ON canonical_skills(partition_key)`,
      // Licensing query (DATABASE.md §2.3 shape 2): partial index keeps it cheap.
      `CREATE INDEX IF NOT EXISTS idx_cs_rights_unknown ON canonical_skills(rights_state)
         WHERE rights_state = 'unknown'`,
      // Cursor pagination (NFR-032): stable composite ordering.
      `CREATE INDEX IF NOT EXISTS idx_cs_cursor ON canonical_skills(created_at, id)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_skill_ref ON jobs(skill_ref)`,
    ],
  },
  {
    version: 2,
    name: 'removal-requests-and-analyser-versions',
    up: [
      // REQ-063: author-initiated correction and removal. The REQUEST is recorded
      // whatever its disposition - a refusal that leaves no trace is indistinguishable
      // from never having been asked.
      `CREATE TABLE IF NOT EXISTS removal_requests (
         request_id TEXT PRIMARY KEY,
         canonical_id TEXT,
         content_hash TEXT,
         repository TEXT NOT NULL,
         kind TEXT NOT NULL,                    -- removal | correction
         reason TEXT NOT NULL,
         requested_by TEXT NOT NULL,
         requested_at TEXT NOT NULL,
         disposition TEXT NOT NULL,             -- pending | actioned | declined
         disposition_reason TEXT,
         actioned_at TEXT,
         actor TEXT
       )`,
      `CREATE INDEX IF NOT EXISTS idx_removal_repo ON removal_requests(repository)`,
      `CREATE INDEX IF NOT EXISTS idx_removal_disposition ON removal_requests(disposition)`,

      // REQ-095: "which records are affected?" must be a QUERY, not a guess. The
      // producing analyser and version travel beside the value they produced.
      `ALTER TABLE canonical_skills ADD COLUMN analyser_versions TEXT NOT NULL DEFAULT '{}'`,
      `CREATE INDEX IF NOT EXISTS idx_cs_analysers ON canonical_skills(analyser_versions)`,

      // DEC-015: a tombstone outlives the bytes it describes.
      `ALTER TABLE canonical_skills ADD COLUMN tombstoned_at TEXT`,
      `ALTER TABLE canonical_skills ADD COLUMN content_bytes_held INTEGER NOT NULL DEFAULT 1`,
      `CREATE INDEX IF NOT EXISTS idx_cs_tombstoned ON canonical_skills(tombstoned_at)`,
    ],
  },
];
