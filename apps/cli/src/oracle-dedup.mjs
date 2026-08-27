#!/usr/bin/env node
/**
 * DES-070 — deduplication oracle validation. REQ-047, NFR-002.
 *
 * Two oracles, both per-row and both genuinely comparable (unlike frontmatter_valid,
 * see CR-004 — content equality means the same thing to both sides):
 *   1. byte-exactness: recompute git's own blob SHA and compare to `file_sha`
 *   2. grouping:       our content_hash partitions vs the corpus's file_sha partitions
 */
import { GitSkillsCorpusConnector, HfRowsCorpusReader } from '../../../packages/connectors/gitskills/src/index.js';
import { compareGrouping, fingerprint } from '../../../packages/ingestion/src/index.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { resolveOccurrence, normalise } from '../../../packages/ingestion/src/index.js';
import { parseSkill } from '../../../packages/ingestion/src/index.js';

const NOW = new Date('2026-08-27T13:45:00Z').toISOString();
const limit = Number(process.argv[2] ?? 300);
const conn = new GitSkillsCorpusConnector({
  reader: new HfRowsCorpusReader({ cacheDir: 'data/corpus/gitskills', maxRows: 2000 }) });
const { records, disclosure } = await conn.discover({ limit, strata: 10 });
const rows = records.map((r) => r.source_payload);

const g = compareGrouping(rows);

// End-to-end: run the real pipeline into a real store and observe the collapse.
const store = new SqliteCanonicalStore(':memory:');
store.migrate({ now: NOW });
let ingested = 0, skipped = 0;
for (const rec of records) {
  const raw = rec.source_payload.content;
  if (typeof raw !== 'string' || raw === '') { skipped++; continue; }
  const parsed = parseSkill(raw);
  const canonical = normalise({ discovery: rec, parsed, rawText: raw, repoLicence: null, now: NOW });
  resolveOccurrence({ store, discovery: rec, canonical, fingerprints: fingerprint(raw), now: NOW });
  ingested++;
}
const counts = store.counts();

console.log(`
DEDUPLICATION ORACLE VALIDATION — REQ-047 / NFR-002
────────────────────────────────────────────────────────────────
sample            ${records.length} discovered · ${ingested} ingested · ${skipped} without content
sampling          ${disclosure.method}, ${disclosure.strata} strata, offsets ${disclosure.offset_range[0].toLocaleString()}–${disclosure.offset_range[1].toLocaleString()}

ORACLE 1 — byte exactness (our git blob sha vs corpus file_sha)
  match           ${g.shaCheck.match}
  MISMATCH        ${g.shaCheck.mismatch}
  unverifiable    ${g.shaCheck.unverifiable} (no content in the corpus row)
  verdict         ${g.shaCheck.mismatch === 0 ? 'EXACT — our byte handling reproduces git\'s own hash' : 'MISMATCH PRESENT'}

ORACLE 2 — grouping (our content_hash partitions vs corpus file_sha partitions)
  comparable groups     ${g.comparableGroups}
  multi-member groups   ${g.multiMemberGroups}
  agreeing              ${g.agree}
  AGREEMENT             ${g.agreement === null ? 'n/a' : (g.agreement * 100).toFixed(2) + '%'}   [NFR-002 target >= 99.9%]
  disagreements         ${g.disagreements.length}

PIPELINE RESULT (real store)
  occurrences     ${counts.occurrences}
  canonical       ${counts.canonical}
  collapsed       ${counts.occurrences - counts.canonical} occurrences resolved onto an existing identity
  duplicate share ${counts.occurrences ? ((1 - counts.canonical / counts.occurrences) * 100).toFixed(1) : 0}%   [R3 measured 50.2% corpus-wide]

  NFR-002 ${g.agreement !== null && g.agreement >= 0.999 ? 'MET' : 'NOT MET'}
  DEC-023 gate: unexplained disagreements must be ZERO -> ${g.disagreements.length + g.shaCheck.mismatch}
────────────────────────────────────────────────────────────────`);

if (g.disagreements.length) {
  console.log('\nGROUPING DISAGREEMENTS (each must be explained, DEC-023):');
  for (const d of g.disagreements.slice(0, 10)) console.log(`  file_sha=${d.file_sha} members=${d.members} ourGroups=${d.ourGroups}`);
}
if (g.shaCheck.mismatch) {
  console.log('\nBYTE MISMATCHES:');
  for (const m of g.shaCheck.mismatches.slice(0, 5)) console.log(`  row ${m.i}: ours=${m.ours} theirs=${m.theirs}`);
}

// ─── ORACLE 3 ────────────────────────────────────────────────────────────────
// Oracles 1 and 2 above are necessary but NOT sufficient, and saying so matters:
// content is stored only on dedup primaries (R3 Finding 3), so every content-bearing
// row in the sample is distinct BY CONSTRUCTION. Comparing 127 singleton groups and
// reporting "100% agreement" would be a true statement that proves nothing about
// deduplication - the collapse path is never exercised.
//
// The corpus does tell us which rows are byte-identical: they share a `file_sha`.
// So take that as given, hand every member of a multi-member group the primary's
// content, and assert the pipeline actually collapses them.
const groups = new Map();
for (const rec of records) {
  const sha = rec.source_payload.file_sha;
  if (!sha) continue;
  if (!groups.has(sha)) groups.set(sha, []);
  groups.get(sha).push(rec);
}
const dupGroups = [...groups.entries()].filter(([, m]) =>
  m.length > 1 && m.some((r) => typeof r.source_payload.content === 'string' && r.source_payload.content));

const store2 = new SqliteCanonicalStore(':memory:');
store2.migrate({ now: NOW });
let members = 0, failures = 0;
for (const [sha, m] of dupGroups) {
  const primary = m.find((r) => typeof r.source_payload.content === 'string' && r.source_payload.content);
  const raw = primary.source_payload.content;
  const ids = new Set();
  for (const rec of m) {
    const parsed = parseSkill(raw);
    const canonical = normalise({ discovery: rec, parsed, rawText: raw, repoLicence: null, now: NOW });
    const res = resolveOccurrence({ store: store2, discovery: rec, canonical,
                                    fingerprints: fingerprint(raw), now: NOW });
    ids.add(res.canonicalId); members++;
  }
  if (ids.size !== 1) failures++;
}
const c2 = store2.counts();
console.log(`
ORACLE 3 — collapse on REAL duplicate groups (the test that actually exercises dedup)
  duplicate groups found   ${dupGroups.length}   (rows sharing a file_sha)
  member occurrences       ${members}
  groups that failed to collapse to one identity   ${failures}
  store: ${c2.occurrences} occurrences -> ${c2.canonical} canonical (${c2.occurrences - c2.canonical} collapsed)
  verdict  ${failures === 0 && dupGroups.length > 0 ? 'PASS - every real duplicate group collapsed to a single identity' : dupGroups.length === 0 ? 'NO DATA - no multi-member groups in this sample' : 'FAIL'}

HONEST READING
  Oracle 2's 100% covers ${g.comparableGroups} groups of which ${g.multiMemberGroups} have >1 member.
  A perfect score over singletons is not evidence about deduplication; Oracle 3 is.
────────────────────────────────────────────────────────────────`);
store2.close();
store.close();
