#!/usr/bin/env node
/**
 * Corpus ingestion for the production index. Increment 15.
 *
 *   node apps/cli/src/ingest.mjs <corpus.jsonl> [--limit N] [--out DIR] [--no-licence]
 *
 * THREE PHASES, DELIBERATELY SEPARATE.
 *
 *   1 LICENCE   resolve L2 for every distinct repository (cached on disk)
 *   2 PIPELINE  the real parse → normalise → fingerprint → dedup → rights path,
 *               into a local file-backed SQLite
 *   3 EMIT      D1-compatible SQL, split into batches
 *
 * Phase 3 writes files; it does NOT touch D1. Applying them is a separate, explicit
 * operator step, so the expensive part can be re-run without risking the live index and
 * the SQL can be read before it is executed.
 *
 * IDEMPOTENT BY CONSTRUCTION (REQ-016). Identity is the content hash, and every statement
 * is INSERT OR REPLACE, so re-running ingests the same corpus to the same state. A partly
 * applied run is resumed by applying the remaining batches, not by starting over.
 *
 * REFUSES RATHER THAN DEGRADES. D1's free tier allows 100,000 row-writes/day. If a run
 * would exceed the declared budget it stops before emitting anything, rather than
 * half-loading the index and leaving the operator to discover which half.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JsonlCorpusReader } from '../../../packages/connectors/gitskills/src/jsonl-corpus-reader.js';
import { RepoLicenceReader } from '../../../packages/connectors/gitskills/src/repo-licence-reader.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence,
         rebuildSearchIndex } from '../../../packages/ingestion/src/index.js';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(name);

const CORPUS = args[0] ?? 'data/corpus/artifacts-10k.jsonl';
const LIMIT = Number(flag('--limit', Infinity));
const OUT = flag('--out', 'data/d1-batches');
const BATCH_ROWS = Number(flag('--batch', 500));
/** D1 free tier. A run projected above this stops before emitting. */
const WRITE_BUDGET = Number(flag('--budget', 90_000));
const NOW = new Date().toISOString();

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const log = (...a) => console.log(...a);

// ---- phase 1: licences ----------------------------------------------------

log(`\nINGEST  ${CORPUS}`);
log('='.repeat(74));

const reader = new JsonlCorpusReader({ path: CORPUS });
await reader.open();

const rows = [];
for await (const row of reader.rows()) {
  if (rows.length >= LIMIT) break;
  if (typeof row.content === 'string' && row.content !== '') rows.push(row);
}
const repoNames = [...new Set(rows.map((r) => r.repo_full_name))];
log(`\n[1] CORPUS      ${rows.length.toLocaleString()} records with content, ` +
    `${repoNames.length.toLocaleString()} distinct repositories`);

let licences = new Map();
if (has('--no-licence')) {
  log('    licence lookup SKIPPED — every record will resolve to rights `unknown`');
} else {
  const licenceReader = new RepoLicenceReader({});
  const t0 = Date.now();
  licences = await licenceReader.lookup(repoNames);
  const resolved = [...licences.values()].filter((v) => v?.license).length;
  log(`[2] LICENCE     ${resolved.toLocaleString()}/${repoNames.length.toLocaleString()} ` +
      `repositories carry a licence (${pct(resolved, repoNames.length)}), ` +
      `${licenceReader.requests} request(s), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (licenceReader.unqueryable.length) {
    // REQ-085 / DEF-004: names we refuse to put in a WHERE clause are reported, not hidden.
    log(`    ${licenceReader.unqueryable.length} name(s) not queryable, recorded as unknown`);
  }
}

// ---- phase 2: the real pipeline -------------------------------------------

const dbPath = join(OUT, 'ingest.db');
mkdirSync(OUT, { recursive: true });
if (existsSync(dbPath)) rmSync(dbPath);

const store = new SqliteCanonicalStore(dbPath);
await store.migrate({ now: NOW });
await store.upsertSource({
  id: 'gitskills',
  accessPolicy: { max_concurrency: 1, permitted_methods: ['parquet', 'datasets-server'] },
  now: NOW,
});

let parseFailed = 0, created = 0, collapsed = 0;
const t1 = Date.now();
for (const row of rows) {
  const raw = row.content;
  const parsed = parseSkill(raw);
  if (!parsed.ok) parseFailed++;

  const discovery = {
    source: 'gitskills',
    external_id: `${row.repo_full_name}:${row.path}`,
    repo_full_name: row.repo_full_name,
    path: row.path,
    author: String(row.repo_full_name).split('/')[0],
    url: `https://github.com/${row.repo_full_name}/blob/HEAD/${row.path}`,
    discovered_at: row.discovered_at ?? NOW,
    channel: row._provenance?.acquisition ?? 'parquet',
    source_payload: row,
  };

  const canonical = normalise({
    discovery, parsed, rawText: raw,
    repoLicence: licences.get(row.repo_full_name)?.license ?? null,
    now: NOW,
  });

  const res = await resolveOccurrence({
    store, discovery, canonical, fingerprints: fingerprint(raw), now: NOW,
  });
  res.created ? created++ : collapsed++;
}
await rebuildSearchIndex({ store, now: NOW });

const counts = await store.counts();
const known = (await store._db.prepare(
  "SELECT COUNT(*) AS n FROM canonical_skills WHERE rights_state = 'known'").get()).n;
const redist = (await store._db.prepare(
  'SELECT COUNT(*) AS n FROM canonical_skills WHERE rights_redistributable = 1').get()).n;

log(`[3] PIPELINE    ${rows.length.toLocaleString()} in → ` +
    `${counts.canonical.toLocaleString()} canonical, ` +
    `${collapsed.toLocaleString()} collapsed as duplicates (${pct(collapsed, rows.length)}), ` +
    `${parseFailed} parse failure(s), ${((Date.now() - t1) / 1000).toFixed(1)}s`);
log(`[4] RIGHTS      ${known.toLocaleString()} known (${pct(known, counts.canonical)}), ` +
    `${(counts.canonical - known).toLocaleString()} unknown ` +
    `(${pct(counts.canonical - known, counts.canonical)}), ` +
    `${redist.toLocaleString()} redistributable`);

// ---- phase 3: emit D1 SQL -------------------------------------------------

const TABLES = ['sources', 'repositories', 'canonical_skills', 'occurrences', 'search_index'];
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const statements = [];
for (const table of TABLES) {
  for (const r of await store._db.prepare(`SELECT * FROM ${table}`).all()) {
    const cols = Object.keys(r);
    statements.push(
      `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => lit(r[c])).join(',')});`);
  }
}
store.close();

if (statements.length > WRITE_BUDGET) {
  console.error(`\nREFUSING TO EMIT: ${statements.length.toLocaleString()} row-writes exceeds the ` +
                `declared budget of ${WRITE_BUDGET.toLocaleString()}.`);
  console.error('D1\'s free tier allows 100,000 row-writes/day. Half-loading the index and');
  console.error('leaving the operator to discover which half is the worse outcome.');
  console.error('Re-run with a smaller --limit, or raise --budget deliberately.');
  process.exit(1);
}

const batches = [];
for (let i = 0; i < statements.length; i += BATCH_ROWS) {
  const n = String(batches.length + 1).padStart(3, '0');
  const file = join(OUT, `batch-${n}.sql`);
  writeFileSync(file, statements.slice(i, i + BATCH_ROWS).join('\n') + '\n');
  batches.push(file);
}

log(`[5] EMITTED     ${statements.length.toLocaleString()} row-writes in ${batches.length} batch file(s) → ${OUT}/`);
log(`                budget ${WRITE_BUDGET.toLocaleString()}/day, using ${pct(statements.length, WRITE_BUDGET)}`);
log(`\nNothing has touched D1. To apply:`);
log(`  for f in ${OUT}/batch-*.sql; do npx wrangler d1 execute skillappmd-canonical --remote --file="$f" --yes; done`);
log('');
