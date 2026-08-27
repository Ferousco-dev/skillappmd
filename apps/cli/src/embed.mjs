#!/usr/bin/env node
/**
 * The batch embedding job. CR-010, NFR-015 (as amended), NFR-041.
 *
 *   GEMINI_API_KEY=... node apps/cli/src/embed.mjs [--db PATH] [--out FILE] [--limit N]
 *                                                 [--budget-usd 1.00] [--dry-run]
 *
 * Reads canonical records, embeds name + description (never the body — DEC-042), and
 * writes NDJSON for `wrangler vectorize insert`. It does NOT upload: uploading is a
 * separate operator step, exactly as the corpus ingest is, so the expensive half can be
 * re-run without touching the live index.
 *
 * SPENDS MONEY. That is why it is a separate command with a declared budget rather than a
 * step inside ingestion. It projects the cost from the actual text it is about to send and
 * REFUSES TO START if that exceeds the budget (NFR-015). A run that discovers it is too
 * expensive halfway through has already spent the money.
 *
 * RESUMABLE (NFR-041). Each vector's id is the canonical id and its key is
 * normalised_hash + model + dimensions, so re-running embeds only what changed. Pass
 * --already FILE with a previous NDJSON to skip what it already contains.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { GeminiEmbedder, FakeEmbedder } from '../../../packages/adapters/gemini-embedder/src/index.js';
import { embeddableText, planEmbedding } from '../../../packages/ingestion/src/resolution.js';
import { embeddingKey } from '../../../packages/ports/src/index.js';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const has = (n) => args.includes(n);

const DB = flag('--db', 'data/d1-batches/ingest.db');
const OUT = flag('--out', 'data/vectors.ndjson');
const LIMIT = Number(flag('--limit', Infinity));
const DIMS = Number(flag('--dimensions', 768));
const BUDGET_USD = Number(flag('--budget-usd', 1.00));
const ALREADY = flag('--already', null);

/** gemini-embedding-001 standard tier, verified 2026-08-27. Batch API is half this. */
const USD_PER_1M_TOKENS = 0.15;

if (!existsSync(DB)) {
  console.error(`no canonical store at ${DB}. Run apps/cli/src/ingest.mjs first.`);
  process.exit(1);
}

const store = new SqliteCanonicalStore(DB);
const records = [];
let cursor = null;
do {
  const page = await store.cursorScan({ cursor, limit: 500 });
  for (const r of page.rows) { if (records.length < LIMIT) records.push(r); }
  cursor = page.cursor.next;
} while (cursor && records.length < LIMIT);

const already = new Set();
if (ALREADY && existsSync(ALREADY)) {
  for (const line of readFileSync(ALREADY, 'utf8').split('\n').filter(Boolean)) {
    const v = JSON.parse(line);
    if (v.metadata?.embedding_key) already.add(v.metadata.embedding_key);
  }
}

const dryRun = has('--dry-run') || !process.env.GEMINI_API_KEY;
const embedder = dryRun
  ? new FakeEmbedder({ dimensions: DIMS })
  : new GeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY, dimensions: DIMS });

const plan = planEmbedding({ records, embedder, alreadyEmbedded: already });

// Projected from the actual text, not from an average.
const tokens = plan.todo.reduce((n, t) => n + Math.ceil(t.text.length / 4), 0);
const projectedUsd = (tokens / 1_000_000) * USD_PER_1M_TOKENS;

console.log(`\nEMBED  ${DB}`);
console.log('='.repeat(74));
console.log(`  records          ${records.length.toLocaleString()}`);
console.log(`  to embed         ${plan.todo.length.toLocaleString()}  (${plan.skipped.length.toLocaleString()} skipped)`);
console.log(`  model            ${plan.model} @ ${plan.dimensions}d`);
console.log(`  projected tokens ${tokens.toLocaleString()}`);
console.log(`  projected cost   $${projectedUsd.toFixed(4)}  (budget $${BUDGET_USD.toFixed(2)})`);

if (projectedUsd > BUDGET_USD) {
  console.error(`\nREFUSING TO START: $${projectedUsd.toFixed(4)} exceeds the declared budget of $${BUDGET_USD.toFixed(2)}.`);
  console.error('A run that discovers it is too expensive halfway through has already spent it.');
  console.error('Raise --budget-usd deliberately, or reduce --limit.');
  store.close();
  process.exit(1);
}

if (dryRun) {
  console.log(`\n  DRY RUN — ${process.env.GEMINI_API_KEY ? '--dry-run given' : 'GEMINI_API_KEY not set'}.`);
  console.log('  Using the deterministic fake embedder: shape is real, semantics are not.');
}

const lines = [];
const BATCH = 32;
const t0 = Date.now();
for (let i = 0; i < plan.todo.length; i += BATCH) {
  const chunk = plan.todo.slice(i, i + BATCH);
  const vectors = await embedder.embed(chunk.map((c) => c.text));
  chunk.forEach((c, n) => {
    lines.push(JSON.stringify({
      id: c.id,
      values: vectors[n],
      // Minimal and non-identifying. The canonical store stays the source of truth; this
      // carries only what ranking and resumability need.
      metadata: {
        normalised_hash: c.record.normalised_hash,
        rights_state: c.record.rights_state,
        embedding_key: embeddingKey(c.record.normalised_hash, plan.model, plan.dimensions),
      },
    }));
  });
  if ((i / BATCH) % 10 === 0) {
    process.stdout.write(`\r  embedded         ${lines.length.toLocaleString()}/${plan.todo.length.toLocaleString()}`);
  }
}
process.stdout.write(`\r  embedded         ${lines.length.toLocaleString()}/${plan.todo.length.toLocaleString()}\n`);

writeFileSync(OUT, lines.join('\n') + (lines.length ? '\n' : ''));
store.close();

console.log(`  elapsed          ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!dryRun) console.log(`  actual usage     ${JSON.stringify(embedder.usage())}`);
console.log(`\n  wrote ${OUT}`);
console.log('\nNothing has touched Vectorize. To upload:');
console.log(`  npx wrangler vectorize insert skillappmd-vectors --file=${OUT}`);
console.log('');
