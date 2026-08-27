#!/usr/bin/env node
/**
 * Subsystem-to-increment coverage checker. G8 criterion 5 — the process change.
 *
 * WHY THIS EXISTS. Both gate failures in Phase 1 had the identical root cause: a
 * subsystem was specified correctly in the architecture and never assigned to an
 * increment.
 *
 *   G4 FAIL — ARCHITECTURE.md §5 listed raw storage as a Phase 1 subsystem.
 *             ROADMAP.md §2 never gave it an increment. Absent.
 *   G5 FAIL — SOURCE_CONNECTORS.md §4 specified SkillsMPConnector in full.
 *             Same omission. Absent.
 *
 * Both documents already existed. Both were correct. **Nothing compared them.**
 * This is the twenty lines that would have prevented two gate attempts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? process.cwd();
const arch = readFileSync(join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
const roadmap = readFileSync(join(ROOT, 'docs/ROADMAP.md'), 'utf8');

// ARCHITECTURE.md §5 now carries an explicit Increment column. Exact matching, because
// a checker that produces false positives gets muted - and a muted checker protects
// nothing. That lesson cost two rewrites of the NFR detectors in phase 05.
const subsystems = [];
for (const m of arch.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*(✅|⚠|❌)\s*\|\s*([^|]*?)\s*\|/gm)) {
  subsystems.push({ name: m[1].trim(), module: m[2].trim(), scope: m[3], increment: m[4].trim() });
}

const increments = new Set();
for (const m of roadmap.matchAll(/^\|\s*\*\*(\d+)\*\*\s*\|/gm)) increments.add(m[1]);

const inScope = subsystems.filter((s) => s.scope === '✅');
const problems = [];
for (const s of inScope) {
  if (!s.increment || /^(deferred|future|—|-)$/i.test(s.increment)) {
    problems.push([s, 'marked in-scope for Phase 1 but names NO increment']);
    continue;
  }
  for (const n of s.increment.split(/[,\s]+/).filter((x) => /^\d+$/.test(x))) {
    if (!increments.has(n)) problems.push([s, `names increment ${n}, which is not in ROADMAP.md`]);
  }
}

console.log(`subsystem coverage: ${inScope.length - new Set(problems.map((p) => p[0].name)).size}` +
            `/${inScope.length} Phase-1 subsystems are assigned to a real increment`);
console.log(`                    ${increments.size} increments in ROADMAP.md, ` +
            `${subsystems.length} subsystems declared`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const [s, why] of problems) console.log(`  ${s.name} (${s.module}) — ${why}`);
  console.log('\nThis is the failure mode that cost G4 and G5 attempt 1: a subsystem the');
  console.log('architecture requires and the plan omits will be absent, and every test');
  console.log('will pass while it is missing.');
  process.exitCode = 1;
}
