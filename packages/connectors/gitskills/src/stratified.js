/**
 * Stratified sampling plan. DEC-024. Traces: DES-004.
 *
 * R3 measured the corpus shards to be ORDERED BY FILE SIZE - the dataset authors
 * partitioned GitHub's code-search space by size to defeat the 1,000-result cap,
 * and the Parquet mirror preserves that write order:
 *
 *   offset       0 -> mean body     10 bytes
 *   offset 200,000 -> mean body    704 bytes
 *   offset 3.4M    -> mean body 19,352 bytes
 *
 * Reading head-of-shard therefore yields ~10-byte files. Validating deduplication
 * or parsing against them would pass while proving nothing. DEC-011's original
 * "one shard" method was withdrawn for exactly this reason.
 */

export const CORPUS_ROWS = 3_797_117;   // R2, verified via datasets-server

/**
 * Evenly spaced strata across the full offset range, so the sample spans the
 * size distribution rather than one end of it.
 */
export function stratifiedPlan({ total = CORPUS_ROWS, sampleSize = 100, strata = 10 } = {}) {
  if (sampleSize < 1) throw new RangeError('sampleSize must be >= 1');
  const n = Math.min(strata, sampleSize);
  const per = Math.floor(sampleSize / n);
  const remainder = sampleSize - per * n;
  const span = Math.floor(total / n);

  const plan = [];
  for (let i = 0; i < n; i++) {
    const take = per + (i < remainder ? 1 : 0);
    // Sample from the START of each stratum: deterministic, so a re-run is
    // byte-identical (NFR-001). Math.random() would break reproducibility.
    const offset = Math.min(i * span, Math.max(0, total - take));
    plan.push({ stratum: i, offset, length: take });
  }
  return plan;
}

/**
 * REQ-085: an ingestion run must state its sampling method and bias.
 * Without this, a head-of-shard run reports "mean skill size 10 bytes" and is
 * indistinguishable from a correct one.
 */
export function samplingDisclosure(plan, { total = CORPUS_ROWS } = {}) {
  const sampled = plan.reduce((a, p) => a + p.length, 0);
  return {
    method: 'stratified-by-offset',
    strata: plan.length,
    sampled,
    population: total,
    fraction: sampled / total,
    offset_range: [plan[0].offset, plan.at(-1).offset + plan.at(-1).length],
    bias: 'Corpus rows are ordered by file size (R3 Finding 2). Even offset strata are used ' +
          'so the sample spans the size distribution. Within each stratum rows are taken ' +
          'consecutively from its start, so the sample is deterministic and reproducible, ' +
          'not uniformly random.',
    caveats: [
      'Snapshot dated 2026-08-10; the corpus decays (RSK-008).',
      'Public repositories only; a lower bound on the population (R1 §4.2).',
    ],
  };
}
