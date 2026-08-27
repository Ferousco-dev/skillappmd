#!/usr/bin/env node
/**
 * Applies the canonical schema to a D1 database via wrangler, then seeds a few records.
 * REQ-094. Emits SQL only - it never holds a credential and never talks to the API.
 */
import { MIGRATIONS } from '../../packages/adapters/sqlite/src/schema.js';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'd1-schema.sql';
const lines = [];
for (const m of MIGRATIONS) {
  lines.push(`-- migration ${m.version}: ${m.name}`);
  for (const stmt of m.up) {
    // D1 exec is line-oriented and comment-sensitive; see D1Driver.exec.
    const flat = stmt.split('\n').map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean).join(' ');
    for (const s of flat.split(';').map((x) => x.trim()).filter(Boolean)) lines.push(`${s};`);
  }
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${out}: ${lines.filter((l) => !l.startsWith('--')).length} statements`);
