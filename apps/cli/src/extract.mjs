#!/usr/bin/env node
/**
 * `appmd corpus extract` - BATCH-ONLY acquisition step (DEC-036).
 * Streams a stratified sample from the real Parquet shards to data/corpus/*.jsonl.
 * Memory-exempt by NFR-014 as amended; everything downstream of the JSONL is not.
 */
import { ParquetExtractor, shardPlan } from '../../../packages/connectors/gitskills/src/parquet-extractor.js';

const total = Number(process.argv[2] ?? 10000);
const strata = Number(process.argv[3] ?? 10);
const out = process.argv[4] ?? 'data/corpus/artifacts-10k.jsonl';

const plan = shardPlan({ total, strata });
console.log(`EXTRACTION PLAN  ${total.toLocaleString()} rows across ${strata} strata`);
for (const p of plan) console.log(`  stratum ${String(p.stratum).padStart(2)}  shard ${String(p.shard).padStart(2)}  take ${p.take}`);
console.log();

const t0 = Date.now();
const ex = new ParquetExtractor({
  onProgress: (p) => console.log(
    `  stratum ${String(p.stratum).padStart(2)} shard ${String(p.shard).padStart(2)}  ` +
    `+${String(p.taken).padStart(5)} rows  total ${String(p.written).padStart(6)}  ` +
    `${String(Math.round(p.ms / 1000)).padStart(4)}s  peak ${Math.round(p.peakRssMb)} MB`),
});

const r = await ex.extract({ outPath: out, plan, batchSize: 1000 });
console.log(`
EXTRACTION COMPLETE
  output          ${r.outPath}
  rows written    ${r.written.toLocaleString()}
  peak RSS        ${Math.round(r.peakRssMb)} MB   (batch-only, exempt per NFR-014 / DEC-036)
  duration        ${Math.round((Date.now() - t0) / 1000)}s
  shards touched  ${r.perShard.map((s) => s.shard).join(', ')}
  population      ${r.population.toLocaleString()}`);
