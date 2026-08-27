/**
 * Repository (L2) licence lookup over the corpus `repos` table. DES-004, DES-038.
 * REQ-005 is priority S precisely because THIS supplies L2 for 282,200 repositories
 * without touching the GitHub API (SOURCE_CONNECTORS.md §5).
 *
 * Uses the datasets-server /filter endpoint. `IN (...)` is rejected by the service,
 * so lookups are batched with OR. Results cache under data/corpus/ (DEC-028).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fetchWithRetry } from './retry.js';

const BASE = 'https://datasets-server.huggingface.co/filter';
const DATASET = 'mvaccargiu/gitskills';

export class RepoLicenceReader {
  #cacheDir; #ua; #batch; #requests = 0;

  constructor({ cacheDir = 'data/corpus/gitskills/repos', batchSize = 20,
                userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)' } = {}) {
    this.#cacheDir = cacheDir; this.#ua = userAgent; this.#batch = batchSize;
    mkdirSync(cacheDir, { recursive: true });
  }

  get requests() { return this.#requests; }

  /** @returns {Map<string, {license, stars, forks, is_fork, language, created_at, pushed_at}>} */
  async lookup(fullNames) {
    const wanted = [...new Set(fullNames)].filter(Boolean).sort();
    const out = new Map();
    for (let i = 0; i < wanted.length; i += this.#batch) {
      const chunk = wanted.slice(i, i + this.#batch);
      for (const [k, v] of await this.#fetchChunk(chunk)) out.set(k, v);
    }
    // A repository absent from `repos` is recorded as such, never guessed (REQ-057).
    for (const n of wanted) if (!out.has(n)) out.set(n, null);
    return out;
  }

  async #fetchChunk(names) {
    const key = createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 24);
    const cacheFile = join(this.#cacheDir, `${key}.json`);
    if (existsSync(cacheFile)) return new Map(JSON.parse(readFileSync(cacheFile, 'utf8')));

    const where = names.map((n) => `"full_name"='${n.replace(/'/g, "''")}'`).join(' OR ');
    const url = `${BASE}?dataset=${encodeURIComponent(DATASET)}&config=repos&split=train` +
                `&where=${encodeURIComponent(where)}&limit=${Math.max(names.length, 1)}`;
    // REQ-024: transient failures retry with backoff and jitter; permanent ones do not.
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': this.#ua, Accept: 'application/json' } });
    this.#requests++;

    const body = await res.json();
    const pairs = (body.rows ?? []).map(({ row }) => [row.full_name, {
      license: row.license ?? null, stars: row.stars ?? null, forks: row.forks ?? null,
      is_fork: row.is_fork ?? 0, language: row.language ?? null,
      created_at: row.created_at ?? null, pushed_at: row.pushed_at ?? null,
    }]);
    writeFileSync(cacheFile, JSON.stringify(pairs));
    return new Map(pairs);
  }
}
