/**
 * ParquetExtractor - BATCH-ONLY corpus acquisition. DES-004, DES-060.
 * REQ-003 (as amended by CR-002). Memory exempt per NFR-014 / DEC-036.
 *
 * THIS FILE IS THE ONLY PLACE `parquet-wasm` MAY BE IMPORTED (CR-005, enforced by
 * the quarantine rule in packages/tools/src/depcheck.js).
 *
 * It cannot run in a Worker and never should: DATABASE.md SS7. Its exemption from the
 * 128 MB budget exists because each 200 MB shard holds ONE row group whose `content`
 * column chunk is 136 MB compressed / 323 MB raw (R4). The exemption buys exactly one
 * thing - permission to hold one shard's chunk - and stops at the JSONL boundary.
 *
 * Output: newline-delimited JSON, written INCREMENTALLY. The whole extracted corpus is
 * never held in memory, at either end (DEC-036 constraint 6).
 */
import { createWriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { REQUIRED_COLUMNS } from './corpus-reader.js';
import { CORPUS_TOTAL } from './hf-rows-reader.js';

const PARQUET_BASE =
  'https://huggingface.co/datasets/mvaccargiu/gitskills/resolve/refs%2Fconvert%2Fparquet/artifacts/train/';
export const SHARD_COUNT = 31;
export const shardUrl = (n) => `${PARQUET_BASE}${String(n).padStart(4, '0')}.parquet`;

/**
 * DEC-024: shards are ORDERED BY FILE SIZE, so strata are chosen across the shard
 * index. Deterministic and reproducible - no randomness anywhere (NFR-001).
 */
export function shardPlan({ total = 10_000, strata = 10, shards = SHARD_COUNT } = {}) {
  const n = Math.min(strata, shards);
  const per = Math.floor(total / n);
  const remainder = total - per * n;
  const step = (shards - 1) / Math.max(1, n - 1);
  return Array.from({ length: n }, (_, i) => ({
    stratum: i,
    shard: Math.round(i * step),
    take: per + (i < remainder ? 1 : 0),
  }));
}

export class ParquetExtractor {
  #ua; #onProgress;
  constructor({ userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)',
                onProgress = () => {} } = {}) {
    this.#ua = userAgent; this.#onProgress = onProgress;
  }

  /**
   * Streams the plan into `outPath` as JSONL. One shard is open at a time; rows are
   * written as they arrive and never accumulated.
   */
  async extract({ outPath, plan, batchSize = 1000 }) {
    const { ParquetFile } = await import('parquet-wasm');   // quarantined import
    const arrow = await import('apache-arrow');             // quarantined companion (DEC-037)
    mkdirSync(dirname(outPath), { recursive: true });
    const out = createWriteStream(outPath, { flags: 'w' });
    const write = (line) => new Promise((res, rej) => out.write(line, (e) => (e ? rej(e) : res())));

    const peak = { rssMb: 0 };
    const track = () => { peak.rssMb = Math.max(peak.rssMb, process.memoryUsage().rss / 1048576); };

    let written = 0;
    const perShard = [];

    for (const step of plan) {
      const url = shardUrl(step.shard);
      const t0 = Date.now();
      let taken = 0;
      let file = null, reader = null;
      try {
        file = await ParquetFile.fromUrl(url);
        const meta = file.metadata();
        const shardRows = Number(meta.fileMetadata().numRows());
        track();

        const stream = await file.stream({ batchSize, columns: [...REQUIRED_COLUMNS] });
        reader = stream.getReader();

        while (taken < step.take) {
          const { done, value } = await reader.read();
          if (done) break;
          track();
          for (const row of recordBatchToRows(value, arrow)) {
            if (taken >= step.take) break;
            // Provenance is attached at extraction time (DEC-036 constraint 5).
            row._provenance = {
              source: 'gitskills',
              acquisition: 'parquet',
              shard: step.shard,
              shard_url: url,
              stratum: step.stratum,
              row_index_in_shard: taken,
              extracted_at: '2026-08-27T00:00:00Z',
            };
            await write(JSON.stringify(row) + '\n');
            taken++; written++;
          }
        }
      } finally {
        try { await reader?.cancel(); } catch { /* stream already closed */ }
        try { file?.free?.(); } catch { /* wasm handle already released */ }
        if (global.gc) global.gc();
      }
      perShard.push({ ...step, taken, ms: Date.now() - t0 });
      this.#onProgress({ stratum: step.stratum, shard: step.shard, taken, written,
                         ms: Date.now() - t0, peakRssMb: peak.rssMb });
    }

    await new Promise((res) => out.end(res));
    return { outPath, written, perShard, peakRssMb: peak.rssMb, population: CORPUS_TOTAL };
  }
}

/**
 * parquet-wasm yields a WASM RecordBatch that exposes Arrow IPC bytes, not JS values.
 * `apache-arrow` is its documented companion for decoding those (DEC-037).
 * One batch is decoded at a time; nothing accumulates.
 */
function recordBatchToRows(batch, arrow) {
  const table = arrow.tableFromIPC(batch.intoIPCStream());
  const names = table.schema.fields.map((f) => f.name);
  const rows = [];
  for (let r = 0; r < table.numRows; r++) {
    const o = {};
    for (const name of names) {
      const v = table.getChild(name)?.get(r);
      o[name] = typeof v === 'bigint' ? Number(v)
              : (v && typeof v === 'object' && 'toString' in v && !Array.isArray(v)) ? String(v)
              : (v ?? null);
    }
    rows.push(o);
  }
  return rows;
}
