#!/usr/bin/env node
/**
 * Increment 9 - the batch ladder. REQ-012, NFR-001, NFR-002, NFR-007, NFR-008.
 *
 * Each rung must satisfy NFR-001 (byte-identical re-run) before the next is attempted.
 * Scale is EARNED after correctness, not assumed alongside it.
 */
import { createHash } from 'node:crypto';
import { GitSkillsCorpusConnector, HfRowsCorpusReader, RepoLicenceReader }
  from '../../../packages/connectors/gitskills/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence } from '../../../packages/ingestion/src/index.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';

const NOW = '2026-08-27T13:45:00Z';   // fixed: NFR-001 needs determinism, not wall-clock drift
const rungs = (process.argv[2] ?? '100,1000').split(',').map(Number);

const reader = new HfRowsCorpusReader({ cacheDir: 'data/corpus/gitskills', maxRows: 12000 });
const conn = new GitSkillsCorpusConnector({ reader });
const repoReader = new RepoLicenceReader();

/** Canonical digest: what NFR-001's "byte-identical" actually means, made checkable. */
async function canonicalDigest(store) {
  const h = createHash('sha256');
  let cursor = null, n = 0;
  do {
    const page = await store.cursorScan({ cursor, limit: 100 });
    for (const r of page.rows) {
      h.update([r.id, r.content_hash, r.normalised_hash, r.rights_state,
                String(r.rights_redistributable), r.retention_policy,
                r.attribution_repository, r.attribution_url, r.licence_json,
                r.provenance_json, r.declared_json].join(' '));
      n++;
    }
    cursor = page.cursor.next;
  } while (cursor);
  return { records: n, digest: 'sha256:' + h.digest('hex') };
}

async function runOnce(records, licences) {
  const store = new SqliteCanonicalStore(':memory:');
  await store.migrate({ now: NOW });
  const t0 = performance.now();
  let ingested = 0, parseFailed = 0, noContent = 0, unknownRights = 0;
  for (const rec of records) {
    const raw = rec.source_payload.content;
    if (typeof raw !== 'string' || raw === '') { noContent++; continue; }
    const parsed = parseSkill(raw);
    if (!parsed.ok) parseFailed++;
    const meta = licences.get(rec.repo_full_name);
    const canonical = normalise({ discovery: rec, parsed, rawText: raw,
                                  repoLicence: meta?.license || null, now: NOW });
    if (canonical.rights.state === 'unknown') unknownRights++;
    await resolveOccurrence({ store, discovery: rec, canonical, fingerprints: fingerprint(raw), now: NOW });
    ingested++;
  }
  const ms = performance.now() - t0;
  const counts = await store.counts();
  const digest = await canonicalDigest(store);
  store.close();
  return { ms, ingested, parseFailed, noContent, unknownRights, counts, digest };
}

const BAR = '='.repeat(74);
console.log('\nBATCH LADDER - increment 9');
console.log(BAR);

let previousOk = true;
for (const rung of rungs) {
  if (!previousOk) { console.log(`\n${rung}: SKIPPED - the previous rung did not pass.`); break; }

  const { records, disclosure } = await conn.discover({ limit: rung, strata: 10 });
  const licences = await repoReader.lookup(records.map((r) => r.repo_full_name));

  const a = await runOnce(records, licences);
  const b = await runOnce(records, licences);           // NFR-001: independent second run

  const identical = a.digest.digest === b.digest.digest && a.digest.records === b.digest.records;
  previousOk = identical;

  console.log(`
RUNG ${rung.toLocaleString()}
  sampling        ${disclosure.method}, ${disclosure.strata} strata
                  offsets ${disclosure.offset_range[0].toLocaleString()} - ${disclosure.offset_range[1].toLocaleString()}
                  ${(disclosure.fraction * 100).toExponential(2)}% of ${disclosure.population.toLocaleString()}
  discovered      ${records.length}
  ingested        ${a.ingested}   (${a.noContent} without content, ${a.parseFailed} parse failures)
  occurrences     ${a.counts.occurrences}
  canonical       ${a.counts.canonical}
  collapsed       ${a.counts.occurrences - a.counts.canonical}
  rights unknown  ${a.unknownRights}  (${a.ingested ? (a.unknownRights / a.ingested * 100).toFixed(1) : 0}%)
  duration        ${a.ms.toFixed(0)}ms  (${(a.ingested / (a.ms / 1000)).toFixed(0)} rec/s)

  NFR-001 byte-identical re-run
    run A         ${a.digest.records} records  ${a.digest.digest.slice(0, 30)}
    run B         ${b.digest.records} records  ${b.digest.digest.slice(0, 30)}
    verdict       ${identical ? 'PASS - identical' : 'FAIL - runs diverge'}`);
}

console.log('\n' + BAR);
console.log(previousOk ? 'LADDER PASSED for every rung attempted.' : 'LADDER HALTED.');
console.log(`corpus rows fetched this session: ${reader.fetchedRows} (rest from data/corpus/ cache)`);
