/**
 * GitSkillsCorpusConnector. REQ-003, REQ-001, REQ-002, REQ-006, REQ-007.
 * Traces: DES-004. Batch runtime only - Parquet/columnar reading needs a real
 * filesystem and memory, which Workers does not have (DATABASE.md §7).
 */
import { assertReaderContract } from './corpus-reader.js';
import { stratifiedPlan, samplingDisclosure, CORPUS_ROWS } from './stratified.js';

export const SOURCE_ID = 'gitskills';

/**
 * DOM-012 / REQ-006: access policy is DATA the runtime enforces, not code the
 * connector is trusted to obey.
 */
export const GITSKILLS_ACCESS_POLICY = Object.freeze({
  max_concurrency: 1,              // a local/columnar corpus; no parallel pressure needed
  permitted_methods: ['local', 'hf-datasets-server'],
  auth: 'none',
  robots: { applies: false, url: null },
  requests_per_minute: null,
  requests_per_day: null,
  tos_notes: 'CC-BY-4.0 dataset. Attribution mandatory (NFR-026). The licence covers the ' +
             'COMPILATION, not the individual skills, which keep their own repository licences.',
  attribution: {
    dataset: 'GitSkills: A Dataset of Agent Skills on GitHub',
    authors: 'Destefanis, Graziotin, Vaccargiu, Ortu',
    doi: '10.5281/zenodo.21875637',
    licence: 'CC-BY-4.0',
  },
});

export class GitSkillsCorpusConnector {
  #reader;
  constructor({ reader }) { assertReaderContract(reader); this.#reader = reader; }

  id() { return SOURCE_ID; }
  accessPolicy() { return GITSKILLS_ACCESS_POLICY; }

  /**
   * REQ-009 / REQ-012: discovery answers "what exists?", bounded by a batch limit.
   * REQ-010: resumable from a persisted cursor.
   * DEC-024: stratified, never head-of-shard.
   */
  async discover({ limit = 100, cursor = null, strata = 10 } = {}) {
    const total = this.#reader.total() ?? CORPUS_ROWS;
    const plan = stratifiedPlan({ total, sampleSize: limit, strata });
    const start = cursor ? decodeCursor(cursor) : 0;

    const records = [];
    let stratumIndex = start;
    for (; stratumIndex < plan.length; stratumIndex++) {
      const { offset, length } = plan[stratumIndex];
      // DEC-016: read range by range, never whole-file. The 128 MB Workers ceiling
      // forces streaming anyway, and NFR-031 forbids assuming the dataset fits.
      const rows = await this.#reader.readRange(offset, length);
      for (const row of rows) records.push(this.#toDiscoveryRecord(row, offset));
    }

    return {
      records,
      cursor: { next: null, consumed: stratumIndex },
      disclosure: samplingDisclosure(plan, { total }),   // REQ-085
    };
  }

  /** REQ-002: one normalised shape regardless of source. */
  #toDiscoveryRecord(row, offset) {
    if (!row.repo_full_name || !row.path) {
      throw new Error('REQ-002 violated: discovery record lacks repository coordinates');
    }
    return {
      source: SOURCE_ID,
      external_id: `${row.repo_full_name}:${row.path}`,
      repo_full_name: row.repo_full_name,     // DEC-014: GitHub coordinates are the identity basis
      path: row.path,
      name: row.name ?? null,
      url: `https://github.com/${row.repo_full_name}/blob/HEAD/${row.path}`,
      author: row.repo_full_name.split('/')[0],
      license_hint: null,                     // L2 comes from `repos`, not from `artifacts`
      version_ref: row.file_sha ?? null,      // DEC-012: source fact, never identity
      discovered_at: row.discovered_at ?? null,
      source_payload: { ...row, _corpus_offset: offset },   // verbatim, for REQ-032 reprocessing
    };
  }

  identify(record) {
    return { source: SOURCE_ID, repo_full_name: record.repo_full_name, path: record.path };
  }

  getMetadata(record) {
    const p = record.source_payload ?? {};
    return {
      location_class: p.location_class ?? null,
      body_chars: p.body_chars ?? null,
      dedup_primary: p.dedup_primary === 1,      // the oracle (REQ-047)
      frontmatter_valid: p.frontmatter_valid === 1,
      has_scripts: p.has_scripts === 1,          // security signal (REQ-075)
      sibling_count: p.sibling_count ?? 0,
      first_commit_at: p.first_commit_at ?? null,
      last_commit_at: p.last_commit_at ?? null,
      commit_count: p.commit_count ?? null,
    };
  }

  /**
   * R3 Finding 3: content exists only on dedup primaries. Duplicates reference
   * the primary's content rather than repeating it, so sizing content on
   * occurrences would overstate it by ~2x.
   */
  getContent(record) {
    const p = record.source_payload ?? {};
    if (p.content_fetched !== 1) {
      return { status: 'NotAvailable', reason: 'content stored only on the dedup primary row' };
    }
    return { status: 'ok', bytes: p.content ?? '', fileSha: p.file_sha ?? null };
  }

  getVersion(record) {
    return { ref: record.source_payload?.file_sha ?? null, kind: 'git-blob-sha' };
  }
}

const decodeCursor = (c) => {
  const n = Number.parseInt(c, 10);
  if (!Number.isInteger(n) || n < 0) throw new Error('INVALID_CURSOR: cursor malformed or expired');
  return n;
};
