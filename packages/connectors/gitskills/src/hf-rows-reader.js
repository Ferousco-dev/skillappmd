/**
 * Network-backed CorpusReader over the Hugging Face datasets-server.
 * Traces: DES-004. See CR-002 for why this rather than direct Parquet in Phase 1.
 *
 * Reads a bounded row range and caches it under data/corpus/ (DEC-028), so a
 * re-run is offline and byte-identical (NFR-001) and no byte is fetched twice.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_COLUMNS } from './corpus-reader.js';

const BASE = 'https://datasets-server.huggingface.co/rows';
const DATASET = 'mvaccargiu/gitskills';
export const CORPUS_TOTAL = 3_797_117;   // verified via datasets-server (R2)

export class HfRowsCorpusReader {
  #cacheDir; #config; #ua; #maxRows; #fetched = 0;

  constructor({ cacheDir = 'data/corpus/gitskills', config = 'artifacts',
                userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)',
                maxRows = 2000 } = {}) {
    this.#cacheDir = cacheDir; this.#config = config; this.#ua = userAgent; this.#maxRows = maxRows;
    mkdirSync(cacheDir, { recursive: true });
  }

  id() { return `hf-rows:${this.#config}`; }
  total() { return CORPUS_TOTAL; }
  get fetchedRows() { return this.#fetched; }

  async readRange(offset, length) {
    if (length > 100) throw new RangeError('datasets-server caps a page at 100 rows');
    // NFR-018 / user instruction: never pull the full corpus.
    if (this.#fetched + length > this.#maxRows) {
      throw new Error(`refusing to exceed maxRows=${this.#maxRows}: this reader fetches a slice, not the corpus`);
    }

    const cacheFile = join(this.#cacheDir, `${this.#config}-${offset}-${length}.json`);
    if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));

    const url = `${BASE}?dataset=${encodeURIComponent(DATASET)}&config=${this.#config}` +
                `&split=train&offset=${offset}&length=${length}`;
    const res = await fetch(url, { headers: { 'User-Agent': this.#ua, Accept: 'application/json' } });
    if (res.status === 429) {
      const ra = res.headers.get('retry-after');
      throw new Error(`SOURCE_RATE_LIMITED: honour Retry-After${ra ? `: ${ra}s` : ''}`);
    }
    if (!res.ok) throw new Error(`corpus read failed: HTTP ${res.status} at offset ${offset}`);

    const body = await res.json();
    // Keep only the columns Phase 1 needs - the point of a columnar source.
    const rows = (body.rows ?? []).map(({ row }) =>
      Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, row[c] ?? null])));

    writeFileSync(cacheFile, JSON.stringify(rows));
    this.#fetched += rows.length;
    return rows;
  }
}
