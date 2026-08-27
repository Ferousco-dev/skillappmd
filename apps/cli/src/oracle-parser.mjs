#!/usr/bin/env node
/**
 * DES-070 — parser oracle validation. REQ-041, NFR-003.
 * Grades OUR frontmatter_valid verdict against the corpus's own column.
 * Stratified sample only (DEC-024).
 */
import { GitSkillsCorpusConnector, HfRowsCorpusReader } from '../../../packages/connectors/gitskills/src/index.js';
import { parseSkill } from '../../../packages/ingestion/src/index.js';

const limit = Number(process.argv[2] ?? 100);
const reader = new HfRowsCorpusReader({ cacheDir: 'data/corpus/gitskills', maxRows: 2000 });
const conn = new GitSkillsCorpusConnector({ reader });
const { records, disclosure } = await conn.discover({ limit, strata: 10 });

let tp = 0, tn = 0, fp = 0, fn = 0, skipped = 0, parseFailed = 0, nonConformant = 0;
const disagreements = [];

for (const r of records) {
  const p = r.source_payload;
  if (p.content_fetched !== 1 || typeof p.content !== 'string' || p.content === '') { skipped++; continue; }
  const ours = parseSkill(p.content);
  if (!ours.ok) parseFailed++;
  const oursValid = ours.frontmatterValid === true;   // structural, comparable
  if (ours.ok && ours.frontmatterValid && !ours.specConformant) nonConformant++;
  const theirs = p.frontmatter_valid === 1;

  if (oursValid && theirs) tp++;
  else if (!oursValid && !theirs) tn++;
  else {
    (oursValid ? fp : fn) === 0 ? null : null;
    if (oursValid) fp++; else fn++;
    disagreements.push({
      repo: r.repo_full_name, path: r.path, ours: oursValid, theirs,
      reasons: ours.ok ? ours.validityReasons : [`${ours.code}: ${ours.reason}`],
      head: (p.content ?? '').slice(0, 90).replace(/\n/g, '\\n'),
    });
  }
}

const compared = tp + tn + fp + fn;
const agreement = compared ? (tp + tn) / compared : 0;

console.log(`
PARSER ORACLE VALIDATION — REQ-041 / NFR-003
────────────────────────────────────────────────────────────────
sample            ${records.length} discovered · ${compared} comparable · ${skipped} skipped (no content)
sampling          ${disclosure.method}, ${disclosure.strata} strata, offsets ${disclosure.offset_range[0].toLocaleString()}–${disclosure.offset_range[1].toLocaleString()}

CONFUSION MATRIX vs corpus frontmatter_valid
  both valid      ${tp}
  both invalid    ${tn}
  we valid, they invalid   ${fp}
  we invalid, they valid   ${fn}

  AGREEMENT       ${(agreement * 100).toFixed(1)}%   [NFR-003 target >= 99%]
  our parse failures ${parseFailed}
  structurally valid but NOT spec-conformant: ${nonConformant}  (AppMD inference, DOM-006)

  NFR-003 target ${agreement >= 0.99 ? 'MET' : 'NOT MET'}
  DEC-023 gate: unexplained disagreements must be ZERO -> ${disagreements.length} to explain
────────────────────────────────────────────────────────────────`);

if (disagreements.length) {
  console.log('\nDISAGREEMENTS (every one must be explained, per DEC-023):\n');
  for (const d of disagreements.slice(0, 15)) {
    console.log(`  ${d.repo}/${d.path}`);
    console.log(`    ours=${d.ours} theirs=${d.theirs}  reasons: ${d.reasons.join('; ') || '(none)'}`);
    console.log(`    head: ${d.head}\n`);
  }
  if (disagreements.length > 15) console.log(`  … ${disagreements.length - 15} more`);
}
