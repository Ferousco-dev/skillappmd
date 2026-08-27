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
const rows = csv.slice(1).map((line) => {
  const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0);
  return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').replace(/^"|"$/g, '')]));
});

const orphans = rows.filter((r) => r.priority !== 'F' && !coverage.has(r.req_id));
const mandatory = rows.filter((r) => r.priority === 'M');
const covered = mandatory.filter((r) => coverage.has(r.req_id));

console.log(`traceability: ${covered.length}/${mandatory.length} mandatory requirements have >=1 test`);
console.log(`              ${[...coverage.keys()].length}/${rows.length} requirements covered overall`);
if (orphans.length) {
  console.log(`\n${orphans.length} requirement(s) with no test:`);
  for (const o of orphans) console.log(`  ${o.req_id} [${o.priority}] ${o.requirement.slice(0, 64)}`);
  console.log('\nAn orphan is either a missing test or a missing implementation.');
  console.log('Both are findings. Neither is fixed by deleting the row.');
  process.exitCode = 1;
}
