#!/usr/bin/env node
/**
 * Increment 3 exit condition: discover 100 real records, stratified, bias reported.
 * Precursor to the full `appmd discover` command (DES-055, REQ-088).
 */
import { GitSkillsCorpusConnector, HfRowsCorpusReader } from '../../../packages/connectors/gitskills/src/index.js';

const limit = Number(process.argv[2] ?? 100);
const reader = new HfRowsCorpusReader({ cacheDir: 'data/corpus/gitskills', maxRows: 2000 });
const connector = new GitSkillsCorpusConnector({ reader });

const t0 = Date.now();
const { records, disclosure } = await connector.discover({ limit, strata: 10 });
const ms = Date.now() - t0;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
// body stats MUST be computed over content-bearing rows only. Including the
// zero-valued non-primaries drags the median to 0 and misrepresents the corpus -
// exactly the class of misleading statistic REQ-085 exists to prevent.
const bodies = records.filter((r) => r.source_payload.content_fetched === 1)
                      .map((r) => r.source_payload.body_chars ?? 0);
const primaries = records.filter((r) => r.source_payload.dedup_primary === 1).length;
const contentBearing = records.filter((r) => r.source_payload.content_fetched === 1);
const fmValid = contentBearing.filter((r) => r.source_payload.frontmatter_valid === 1).length;

// REQ-085: counts, failures, AND the sampling bias. Never counts alone.
console.log(`
INGESTION RUN REPORT — discovery
────────────────────────────────────────────────────────────────
source            gitskills (CC-BY-4.0, DOI 10.5281/zenodo.21875637)
records           ${records.length}
duration          ${ms} ms
rows fetched      ${reader.fetchedRows} (cached under data/corpus/, gitignored)

SAMPLING (REQ-085)
  method          ${disclosure.method}
  strata          ${disclosure.strata}
  offset range    ${disclosure.offset_range[0].toLocaleString()} … ${disclosure.offset_range[1].toLocaleString()}
  population      ${disclosure.population.toLocaleString()}
  fraction        ${(disclosure.fraction * 100).toExponential(2)} %
  bias            ${disclosure.bias}
  caveats         ${disclosure.caveats.join('\n                  ')}

OBSERVED (this sample)
  body_chars*     mean ${mean(bodies).toFixed(0)} · median ${bodies.slice().sort((a,b)=>a-b)[Math.floor(bodies.length/2)]} · max ${Math.max(...bodies)}
  dedup_primary   ${primaries}/${records.length} = ${(primaries / records.length * 100).toFixed(1)}%   [R3 measured 50.2% · paper 50.5%]
  content-bearing ${contentBearing.length}
  frontmatter_ok  ${fmValid}/${contentBearing.length}${contentBearing.length ? ` = ${(fmValid / contentBearing.length * 100).toFixed(1)}%` : ''}   [R3 measured 77.4%]
  distinct repos  ${new Set(records.map((r) => r.repo_full_name)).size}
  * body stats over content-bearing rows only (n=${bodies.length}); non-primaries carry no content (R3 Finding 3)
────────────────────────────────────────────────────────────────`);

const sample = records[Math.floor(records.length / 2)];
console.log('\nSample discovery record (normalised shape, REQ-002):');
console.log(JSON.stringify({ ...sample, source_payload: { _elided: `${Object.keys(sample.source_payload).length} columns retained verbatim for REQ-032` } }, null, 2));
