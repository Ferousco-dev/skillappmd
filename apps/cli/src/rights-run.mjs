#!/usr/bin/env node
/**
 * Increment 7 exit condition: provenance, licence and rights end-to-end on real data.
 * NFR-006: ZERO records may carry redistributable=true without recorded L2 evidence.
 */
import { GitSkillsCorpusConnector, HfRowsCorpusReader, RepoLicenceReader }
  from '../../../packages/connectors/gitskills/src/index.js';
import { parseSkill, normalise, fingerprint, resolveOccurrence }
  from '../../../packages/ingestion/src/index.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { normaliseSpdx, UNKNOWN, RIGHTS_STATE } from '../../../packages/skill-core/src/index.js';

const NOW = new Date('2026-08-27T13:45:00Z').toISOString();
const limit = Number(process.argv[2] ?? 300);

const conn = new GitSkillsCorpusConnector({
  reader: new HfRowsCorpusReader({ cacheDir: 'data/corpus/gitskills', maxRows: 2000 }) });
const { records, disclosure } = await conn.discover({ limit, strata: 10 });

const repoReader = new RepoLicenceReader();
const licences = await repoReader.lookup(records.map((r) => r.repo_full_name));

const store = new SqliteCanonicalStore(':memory:');
await store.migrate({ now: NOW });

const stats = { ingested: 0, skipped: 0, known: 0, unknown: 0, redistributable: 0,
                conflicts: 0, l3Only: 0, unmappedSpdx: new Map(), retention: new Map() };

for (const rec of records) {
  const raw = rec.source_payload.content;
  if (typeof raw !== 'string' || raw === '') { stats.skipped++; continue; }
  const meta = licences.get(rec.repo_full_name);
  const rawLic = meta?.license && meta.license !== '' ? meta.license : null;
  if (rawLic && normaliseSpdx(rawLic) === UNKNOWN) {
    stats.unmappedSpdx.set(rawLic, (stats.unmappedSpdx.get(rawLic) ?? 0) + 1);
  }
  const parsed = parseSkill(raw);
  const canonical = normalise({ discovery: rec, parsed, rawText: raw,
                                repoLicence: rawLic, now: NOW });
  await resolveOccurrence({ store, discovery: rec, canonical, fingerprints: fingerprint(raw), now: NOW });

  stats.ingested++;
  if (canonical.rights.state === RIGHTS_STATE.KNOWN) stats.known++; else stats.unknown++;
  if (canonical.rights.redistributable) stats.redistributable++;
  if (canonical.licence.conflict) stats.conflicts++;
  if (canonical.licence.l2_repository.spdx === UNKNOWN &&
      canonical.licence.l3_declared.spdx !== UNKNOWN) stats.l3Only++;
  stats.retention.set(canonical.retentionPolicy, (stats.retention.get(canonical.retentionPolicy) ?? 0) + 1);
}

// ── NFR-006, asserted against the STORE, not against our own in-memory objects ──
const rows = (await store.cursorScan({ limit: 100 })).rows;
let all = rows, cur = (await store.cursorScan({ limit: 100 })).cursor.next;
while (cur) { const p = await store.cursorScan({ cursor: cur, limit: 100 }); all = all.concat(p.rows); cur = p.cursor.next; }
const violations = all.filter((r) => {
  if (!r.rights_redistributable) return false;
  return JSON.parse(r.licence_json).l2_repository.spdx === UNKNOWN;
});
const attributionGaps = all.filter((r) =>
  !r.attribution_repository || !r.attribution_owner || !r.attribution_url);
const unclassified = all.filter((r) => {
  const fo = JSON.parse(r.provenance_json).field_origins ?? {};
  return Object.values(fo).some((v) => !/^(source_fact|appmd_inference):/.test(v));
});

const pct = (n) => stats.ingested ? (n / stats.ingested * 100).toFixed(1) + '%' : '0%';
console.log(`
RIGHTS AND PROVENANCE RUN — increment 7
────────────────────────────────────────────────────────────────
sample            ${records.length} discovered · ${stats.ingested} ingested · ${stats.skipped} without content
sampling          ${disclosure.method}, ${disclosure.strata} strata
repo lookups      ${repoReader.requests} request(s) for ${licences.size} repositories

LICENCE OUTCOMES (three layers, DEC-006)
  rights known          ${stats.known}  (${pct(stats.known)})
  rights UNKNOWN        ${stats.unknown}  (${pct(stats.unknown)})   <- explicit state, DEC-018
  redistributable       ${stats.redistributable}  (${pct(stats.redistributable)})
  L2/L3 conflicts       ${stats.conflicts}
  L3 claim, no L2       ${stats.l3Only}   <- a claim is not authority

RETENTION (rights-aware, DEC-019)
${[...stats.retention].map(([k, v]) => `  ${k.padEnd(22)}${v}`).join('\n')}

UNMAPPED LICENCE STRINGS (normalised to UNKNOWN rather than guessed, REQ-057)
${stats.unmappedSpdx.size ? [...stats.unmappedSpdx].map(([k, v]) => `  ${k.padEnd(22)}${v}`).join('\n') : '  (none)'}

INVARIANTS, CHECKED AGAINST THE STORE
  canonical records                       ${all.length}
  NFR-006  redistributable without L2     ${violations.length}   ${violations.length === 0 ? 'PASS' : 'FAIL'}
  NFR-004  missing attribution            ${attributionGaps.length}   ${attributionGaps.length === 0 ? 'PASS' : 'FAIL'}
  NFR-005  unclassifiable field origins   ${unclassified.length}   ${unclassified.length === 0 ? 'PASS' : 'FAIL'}
────────────────────────────────────────────────────────────────`);
store.close();
