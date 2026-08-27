#!/usr/bin/env node
/**
 * Traceability checker. G5 criterion 3.
 *
 * Regenerates the matrix from TEST TITLES and reports orphans. Run in CI so a
 * requirement cannot quietly lose its coverage, and so a test cannot claim a
 * requirement it does not exercise without someone noticing the count move.
 *
 * DEF-008 is why this exists: a title naming REQ-004 made an unimplemented
 * requirement read as covered for weeks.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? process.cwd();
const walk = (d, o = []) => {
  if (!existsSync(d)) return o;
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p, o) : o.push(p);
  }
  return o;
};

const testFiles = [...walk(join(ROOT, 'packages')), ...walk(join(ROOT, 'apps'))]
  .filter((f) => /\.test\.(js|mjs)$/.test(f));

const coverage = new Map();
for (const f of testFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/test\([`']([^`']*?)[`']/g)) {
    const title = m[1];
    const tc = /(TC-\d{3})/.exec(title);
    if (!tc) continue;
    for (const rid of title.match(/\b(?:REQ|NFR|DOM)-\d{3}\b/g) ?? []) {
      if (!coverage.has(rid)) coverage.set(rid, new Set());
      coverage.get(rid).add(tc[1]);
    }
  }
}

const csv = readFileSync(join(ROOT, '.ilana/traceability.csv'), 'utf8').trim().split('\n');
const header = csv[0].split(',');
/**
 * A correct CSV split. The previous regex dropped a column whenever a field was EMPTY,
 * so `…,src/x.js,,implemented` parsed `status` as '' and shifted everything after it.
 *
 * That was harmless while nothing read `status`. It stopped being harmless the moment
 * status decided whether the build fails: a malformed row would silently downgrade a
 * real defect to a "declared gap" — the exact hole this check must not have. Found by
 * planting an orphan and watching it pass.
 */
function splitCsvLine(line) {
  const out = [];
  let field = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

const rows = csv.slice(1).map((line) => {
  const cells = splitCsvLine(line);
  return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
});

const untested = rows.filter((r) => r.priority !== 'F' && !coverage.has(r.req_id));
const mandatory = rows.filter((r) => r.priority === 'M');
const covered = mandatory.filter((r) => coverage.has(r.req_id));

/**
 * DEC-041. Two different things were being reported as one, and the difference decides
 * whether the build should fail.
 *
 *   status=implemented, no test  -> DEFECT. Code exists that nothing proves. Fail.
 *   status=designed,     no test -> a PLAN item. Declared, not yet built. Report, pass.
 *
 * Before this split the checker exited 1 on `REQ-005` and `REQ-014` — both deliberately
 * unbuilt under DEC-039 — so CI was red by design. A permanently red build teaches people
 * to ignore CI, which costs more than the finding is worth.
 *
 * This is NOT a way to silence a finding. A declared gap must be marked `designed` in
 * .ilana/traceability.csv, it is still printed on every run, and moving a row to
 * `designed` to dodge a failure is a visible edit to a committed file.
 */
// FAIL CLOSED. Only an explicit `designed` counts as a declared gap; anything else -
// including a status that failed to parse - is treated as a defect. A checker that
// defaults to "probably fine" is not a checker.
const declared = untested.filter((r) => r.status === 'designed');
const defects = untested.filter((r) => r.status !== 'designed');

console.log(`traceability: ${covered.length}/${mandatory.length} mandatory requirements have >=1 test`);
console.log(`              ${[...coverage.keys()].length}/${rows.length} requirements covered overall`);

if (declared.length) {
  console.log(`\n${declared.length} requirement(s) declared but not yet built (DEC-039):`);
  for (const o of declared) console.log(`  ${o.req_id} [${o.priority}] ${o.requirement.slice(0, 64)}`);
  console.log('Declared gaps. A gap a tool announces is not a gap nobody knows about.');
}

if (defects.length) {
  console.log(`\n${defects.length} requirement(s) marked IMPLEMENTED with no test:`);
  for (const o of defects) console.log(`  ${o.req_id} [${o.priority}] ${o.requirement.slice(0, 64)}`);
  console.log('\nCode exists that nothing proves. Neither is fixed by deleting the row.');
  process.exitCode = 1;
}
