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
import { join, relative, resolve, dirname } from 'node:path';

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

/**
 * CR-005 criterion 6: the Parquet dependency must stay inside the GitSkills corpus
 * connector and must never leak into domain, ports, pipeline or app code. Enforced
 * here rather than trusted, because "we'll be careful" is not a boundary.
 */
const QUARANTINED = [
  { pkg: /^parquet-wasm(\/|$)/, allowedIn: 'packages/connectors/gitskills/src/' },
];
const QUARANTINE_SCAN = ['packages', 'apps'];

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

/**
 * Layers a given layer may NOT reach into via a RELATIVE path.
 * Without this the lint had a hole: it only inspected bare specifiers, so
 * `../../adapters/sqlite/src/index.js` would have passed silently. A lint with a
 * hole is worse than no lint, because it is trusted.
 */
const RELATIVE_FORBID = {
  'packages/skill-core': ['packages/adapters', 'packages/ingestion', 'packages/connectors', 'apps'],
  'packages/ports':      ['packages/adapters', 'packages/ingestion', 'packages/connectors', 'apps'],
  'packages/ingestion':  ['packages/adapters', 'apps'],
  'packages/connectors': ['packages/adapters', 'apps'],
};

const violations = [];
for (const rule of RULES) {
  for (const file of walk(join(ROOT, rule.layer))) {
    // Test files may reach for adapters to assemble a rig; production source may not.
    const isTest = /[\\/](test|fixtures)[\\/]/.test(file) || /\.test\.(js|mjs|ts)$/.test(file);
    // Tests and fixtures legitimately assemble a rig from concrete adapters; that is
    // what a contract test IS. The rule constrains PRODUCTION source only.
    if (isTest) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      for (const bad of rule.forbid) {
        if (bad.test(spec)) {
          violations.push({ file: relative(ROOT, file), spec, layer: rule.layer, why: rule.why });
        }
      }
      if (spec.startsWith('.')) {
        const target = relative(ROOT, resolve(dirname(file), spec)).replace(/\\/g, '/');
        for (const forbidden of RELATIVE_FORBID[rule.layer] ?? []) {
          if (target.startsWith(forbidden)) {
            violations.push({ file: relative(ROOT, file), spec, layer: rule.layer,
              why: `relative import escapes into ${forbidden}: ${rule.why}` });
          }
        }
      }
    }
  }
}

// Quarantine sweep: the whole tree, not only the layered packages.
for (const root of QUARANTINE_SCAN) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (rel.includes('/node_modules/')) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      for (const q of QUARANTINED) {
        if (q.pkg.test(m[1]) && !rel.startsWith(q.allowedIn)) {
          violations.push({ file: rel, spec: m[1], layer: 'quarantine',
            why: `"${m[1]}" is quarantined to ${q.allowedIn} (CR-005). It must remain replaceable behind the CorpusReader seam.` });
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
console.log('  NFR-028 ok: dependency direction clean across', RULES.length,
  'layers (bare specifiers and relative paths)');
