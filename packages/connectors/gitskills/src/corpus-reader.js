/**
 * CorpusReader - the seam that lets fixtures and real corpus data share one
 * code path. Traces: DES-004, DES-071.
 *
 * NFR-030: connector logic is tested entirely offline against fixtures; the
 * network-backed reader is exercised separately and manually.
 */

/** Columns Phase 1 actually needs (R2 §2). Selecting narrowly is the point of a columnar source. */
export const REQUIRED_COLUMNS = Object.freeze([
  'repo_full_name', 'path', 'filename', 'location_class', 'file_sha',
  'discovered_at', 'content', 'content_fetched', 'frontmatter_valid',
  'name', 'description', 'body_chars', 'dedup_primary',
  'first_commit_at', 'last_commit_at', 'commit_count',
  'sibling_count', 'has_scripts', 'content_sha_ok',
]);

export function assertReaderContract(reader) {
  for (const m of ['id', 'readRange', 'total']) {
    if (typeof reader?.[m] !== 'function') {
      throw new Error(`CorpusReader contract violated: missing ${m}()`);
    }
  }
  return true;
}

/** Deterministic in-memory reader over fixture rows. No I/O at all. */
export class FixtureCorpusReader {
  #rows;
  constructor(rows) { this.#rows = rows; }
  id() { return 'fixture'; }
  total() { return this.#rows.length; }
  async readRange(offset, length) { return this.#rows.slice(offset, offset + length); }
}
