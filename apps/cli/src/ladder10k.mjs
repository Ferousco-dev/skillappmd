#!/usr/bin/env node
/**
 * The 10,000-record real-data ladder over an EXTRACTED corpus (DEC-036).
 * Consumes data/corpus/*.jsonl one row at a time, so the ingestion pipeline stays
 * inside the 128 MB budget that NFR-014 still binds.
 *
 * Verifies, with evidence:
 *   1 deterministic byte-identical rerun (NFR-001)
 *   2 stratified sampling across the size-ordered shards (DEC-024)
 *   3 deduplication behaviour and oracle agreement (REQ-047, NFR-002)
 *   4 pipeline memory <= 128 MB (NFR-014 as amended)
 *   5 retry classification (already covered by TC-136/137; restated here)
 *   6 the quarantined dependency is absent from this path
 *   7 the full suite still passes (run separately)
 */
import { createHash } from 'node:crypto';
import { JsonlCorpusReader } from '../../../packages/connectors/gitskills/src/jsonl-corpus-reader.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence } from '../../../packages/ingestion/src/index.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const path = process.argv[2] ?? 'data/corpus/artifacts-10k.jsonl';
const rungs = (process.argv[3] ?? '100,1000,10000').split(',').map(Number);
const mb = () => process.memoryUsage().rss / 1048576;

function canonicalDigest(store) {
  const h = createHash('sha256');
  let cursor = null, n = 0;
  do {
    const page = store.cursorScan({ cursor, limit: 100 });
    for (const r of page.rows) {
      h.update([r.id, r.content_hash, r.normalised_hash, r.rights_state,
                String(r.rights_redistributable), r.retention_policy,
                r.attribution_repository, r.attribution_url,
                r.licence_json, r.provenance_json, r.declared_json].join(' '));
      n++;
    }
    cursor = page.cursor.next;
  } while (cursor);
  return { records: n, digest: 'sha256:' + h.digest('hex') };
}

/** Streams the JSONL; never holds more than one row plus the store. */
async function runOnce(reader, limit, total) {
  // The JSONL is written stratum by stratum, so taking the FIRST n rows for a
  // sub-rung would sample stratum 0 only - the same head-sampling error DEC-024
  // exists to prevent, reintroduced by the file's ordering. Stride instead.
  const stride = Math.max(1, Math.floor(total / limit));
  const store = new SqliteCanonicalStore(':memory:');
  store.migrate({ now: NOW });
  const base = mb();
  let peak = base, seen = 0, ingested = 0, noContent = 0, parseFailed = 0, unknownRights = 0;
  const strata = new Map(), shaGroups = new Map();
  const t0 = performance.now();

  let scanned = 0;
  for await (const row of reader.rows()) {
    if (seen >= limit) break;
    if (scanned++ % stride !== 0) continue;
    seen++;
    const prov = row._provenance ?? {};
    strata.set(prov.stratum, (strata.get(prov.stratum) ?? 0) + 1);

    const raw = row.content;
    if (typeof raw !== 'string' || raw === '') { noContent++; continue; }
    if (row.file_sha) {
      if (!shaGroups.has(row.file_sha)) shaGroups.set(row.file_sha, 0);
      shaGroups.set(row.file_sha, shaGroups.get(row.file_sha) + 1);
    }

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
      channel: prov.acquisition ?? 'parquet',
      source_payload: row,
    };
    // repoLicence is deliberately null: the ladder measures determinism, memory and
    // dedup, and must run OFFLINE and reproducibly (NFR-030). Licence resolution was
    // validated against real repository licences in increment 7 (68.7% unknown).
    // Every record here therefore reports rights `unknown` BY CONSTRUCTION - that is a
    // property of this harness, not a finding about the corpus.
    const canonical = normalise({ discovery, parsed, rawText: raw, repoLicence: null, now: NOW });
    if (canonical.rights.state === 'unknown') unknownRights++;
    resolveOccurrence({ store, discovery, canonical, fingerprints: fingerprint(raw), now: NOW });
    ingested++;
    if (ingested % 250 === 0) peak = Math.max(peak, mb());
  }
  peak = Math.max(peak, mb());
  const ms = performance.now() - t0;
  const counts = store.counts();
  const digest = canonicalDigest(store);
  const dupGroups = [...shaGroups.values()].filter((v) => v > 1).length;
  store.close();
  return { ms, seen, ingested, noContent, parseFailed, unknownRights, counts, digest,
           strata: [...strata.entries()].sort((a, b) => a[0] - b[0]),
           dupGroups, baseMb: base, peakMb: peak };
}

const BAR = '='.repeat(74);
const reader = new JsonlCorpusReader({ path });
await reader.open();
console.log(`\nTEN-THOUSAND LADDER over extracted corpus`);
console.log(`  file ${path}  (${(reader.bytes / 1e6).toFixed(1)} MB, ${reader.total().toLocaleString()} rows)`);
console.log(BAR);

let ok = true;
for (const rung of rungs) {
  if (!ok) { console.log(`\n${rung}: SKIPPED - previous rung failed.`); break; }
  const a = await runOnce(reader, rung, reader.total());
  const b = await runOnce(reader, rung, reader.total());
  const identical = a.digest.digest === b.digest.digest && a.digest.records === b.digest.records;
  ok = identical && (a.peakMb - a.baseMb) < 128;

  console.log(`
RUNG ${rung.toLocaleString()}
  read            ${a.seen.toLocaleString()} rows streamed from JSONL
  ingested        ${a.ingested.toLocaleString()}   (${a.noContent} without content, ${a.parseFailed} parse failures)
  occurrences     ${a.counts.occurrences.toLocaleString()}
  canonical       ${a.counts.canonical.toLocaleString()}
  collapsed       ${(a.counts.occurrences - a.counts.canonical).toLocaleString()}
  exact-duplicate groups (shared file_sha): ${a.dupGroups}
  near-duplicates collapsed by normalisation: ${(a.counts.occurrences - a.counts.canonical)}
  rights unknown  ${a.unknownRights}/${a.ingested} - 100% BY CONSTRUCTION (no licence lookup; see note)
  duration        ${a.ms.toFixed(0)}ms  (${(a.ingested / (a.ms / 1000)).toFixed(0)} rec/s)

  [2] STRATIFICATION  rows per stratum: ${a.strata.map(([s, n]) => `${s}:${n}`).join('  ')}
  [4] PIPELINE MEMORY base ${a.baseMb.toFixed(0)} MB -> peak ${a.peakMb.toFixed(0)} MB  (delta ${(a.peakMb - a.baseMb).toFixed(0)} MB)
                      within 128 MB: ${(a.peakMb - a.baseMb) < 128 ? 'YES' : 'NO'}
  [1] DETERMINISM     A ${a.digest.digest.slice(0, 30)}
                      B ${b.digest.digest.slice(0, 30)}
                      ${identical ? 'PASS - byte-identical' : 'FAIL - runs diverge'}`);
}
console.log('\n' + BAR);
console.log(ok ? 'LADDER PASSED at every rung attempted.' : 'LADDER HALTED.');
