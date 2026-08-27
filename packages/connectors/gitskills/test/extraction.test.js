import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlCorpusReader } from '../src/jsonl-corpus-reader.js';
import { shardPlan, shardUrl, SHARD_COUNT } from '../src/parquet-extractor.js';
import { assertReaderContract } from '../src/corpus-reader.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'appmd-jsonl-'));
function fixture(dir, rows) {
  const p = join(dir, 'corpus.jsonl');
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return p;
}
const row = (i, stratum) => ({ repo_full_name: `o/r${i}`, path: 'SKILL.md',
  file_sha: `sha${i}`, content: `---\nname: s-${i}\ndescription: d\n---\nbody ${i}`,
  content_fetched: 1, dedup_primary: 1, frontmatter_valid: 1, body_chars: 6,
  _provenance: { source: 'gitskills', acquisition: 'parquet', shard: stratum * 3,
                 stratum, row_index_in_shard: i, extracted_at: '2026-08-27T00:00:00Z' } });

test('TC-173 DEC-036 the JSONL reader satisfies the CorpusReader contract', async () => {
  const dir = tmp();
  try {
    const r = new JsonlCorpusReader({ path: fixture(dir, [row(0, 0), row(1, 0)]) });
    assert.ok(assertReaderContract(r));
    await r.open();
    assert.equal(r.total(), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-174 DEC-036 the reader streams: the whole corpus is never held in memory', async () => {
  const dir = tmp();
  try {
    const r = new JsonlCorpusReader({ path: fixture(dir, Array.from({ length: 500 }, (_, i) => row(i, i % 10))) });
    let count = 0, concurrent = 0, maxConcurrent = 0;
    for await (const x of r.rows()) {
      concurrent = 1; maxConcurrent = Math.max(maxConcurrent, concurrent);
      assert.ok(x.repo_full_name); count++; concurrent = 0;
    }
    assert.equal(count, 500);
    assert.equal(maxConcurrent, 1, 'exactly one row is live at a time');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-175 DEC-036 extraction provenance survives into every row', async () => {
  const dir = tmp();
  try {
    const r = new JsonlCorpusReader({ path: fixture(dir, [row(0, 3)]) });
    const [x] = await r.readRange(0, 1);
    for (const f of ['source', 'acquisition', 'shard', 'stratum', 'row_index_in_shard', 'extracted_at']) {
      assert.ok(f in x._provenance, `provenance must carry ${f}`);
    }
    assert.equal(x._provenance.acquisition, 'parquet');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-176 NFR-001 readRange is deterministic: the same range yields the same rows', async () => {
  const dir = tmp();
  try {
    const r = new JsonlCorpusReader({ path: fixture(dir, Array.from({ length: 50 }, (_, i) => row(i, i % 10))) });
    const a = await r.readRange(10, 5);
    const b = await r.readRange(10, 5);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.length, 5);
    assert.equal(a[0].repo_full_name, 'o/r10', 'ordering is preserved from extraction');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TC-177 INTERFACE CORPUS_NOT_FOUND names the recovery action', () => {
  assert.throws(() => new JsonlCorpusReader({ path: '/nope/missing.jsonl' }),
    /CORPUS_NOT_FOUND.*appmd corpus extract/s);
});

test('TC-178 DEC-024 the shard plan spreads strata across the size-ordered shards', () => {
  const plan = shardPlan({ total: 10_000, strata: 10 });
  assert.equal(plan.reduce((a, p) => a + p.take, 0), 10_000, 'the plan sums to the request');
  assert.equal(plan.length, 10);
  assert.equal(plan[0].shard, 0, 'starts at the smallest-file shard');
  assert.equal(plan.at(-1).shard, SHARD_COUNT - 1, 'reaches the largest-file shard');
  const shards = plan.map((p) => p.shard);
  assert.equal(new Set(shards).size, 10, 'no shard is sampled twice');
  for (let i = 1; i < shards.length; i++) assert.ok(shards[i] > shards[i - 1], 'monotonic');
});

test('TC-179 shardPlan is exact for awkward totals', () => {
  for (const n of [1, 7, 99, 101, 9999]) {
    assert.equal(shardPlan({ total: n, strata: 10 }).reduce((a, p) => a + p.take, 0), n);
  }
});

test('TC-180 CR-005 the shard URL targets the real CC-BY-4.0 corpus', () => {
  const u = shardUrl(7);
  assert.match(u, /^https:\/\/huggingface\.co\/datasets\/mvaccargiu\/gitskills\//);
  assert.match(u, /0007\.parquet$/);
});
