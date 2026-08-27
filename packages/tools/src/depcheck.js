#!/usr/bin/env node
/**
 * DES-059 — dependency-direction lint. NFR-028.
 *
 * "Verified by a dependency-direction lint rule, not by review discipline."
 * Review discipline decays; a failing build does not.
 *
 * DEC-027's migration path is only affordable if this holds. If domain logic
 * imports a SQL driver, that decision is a trap rather than a plan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? process.cwd();

const RULES = [
  { layer: 'packages/skill-core', forbid: [/^@appmd\/(?!skill-core)/, /^node:fs/, /^node:net/,
      /^node:http/, /sqlite/i, /^pg$/, /mongodb/i, /@cloudflare/, /^undici/, /^duckdb/],
    why: 'skill-core is pure domain: no I/O, no adapters, no vendor SDK' },
  { layer: 'packages/ports', forbid: [/^@appmd\/adapters/, /sqlite/i, /^pg$/, /@cloudflare/, /^duckdb/],
    why: 'ports are interfaces only' },
  { layer: 'packages/ingestion', forbid: [/^@appmd\/adapters/, /sqlite/i, /^pg$/, /@cloudflare/, /^duckdb/],
    why: 'pipeline stages import ports only; adapters are chosen at the composition root' },
  { layer: 'packages/connectors', forbid: [/^@appmd\/adapters/, /sqlite/i, /^pg$/],
    why: 'connectors import ports only' },
];

const IMPORT_RE = /(?:^|\n)\s*(?:import[\s\S]*?from\s*|import\s*|export[\s\S]*?from\s*)['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '.git') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|ts)$/.test(p)) out.push(p);
  }
  return out;
}

const violations = [];
for (const rule of RULES) {
  for (const file of walk(join(ROOT, rule.layer))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      for (const bad of rule.forbid) {
        if (bad.test(spec)) {
          violations.push({ file: relative(ROOT, file), spec, layer: rule.layer, why: rule.why });
        }
      }
    }
  }
}

if (violations.length) {
  console.error('\n  NFR-028 VIOLATED — dependency direction\n');
  for (const v of violations) {
    console.error(`  ${v.file}\n     imports "${v.spec}"\n     ${v.layer}: ${v.why}\n`);
  }
  console.error(`  ${violations.length} violation(s). Build fails.\n`);
  process.exit(1);
}
console.log('  NFR-028 ok: dependency direction clean across', RULES.length, 'layers');
