/**
 * The process change carried out of G8 is itself a piece of software, so it is held to
 * the same standard as everything else here: the test must prove the checker FAILS on a
 * plan with a hole in it. A checker that only ever passes is indistinguishable from no
 * checker at all — which is precisely the condition that cost G4 and G5 their first
 * attempt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHECKER = resolve(import.meta.dirname, '../src/subsystem-coverage.js');
const REPO = resolve(import.meta.dirname, '../../..');

const ROADMAP = `# Roadmap\n\n| # | Increment |\n| --- | --- |\n| **1** | Ports |\n| **2** | Storage |\n`;

const arch = (incrementForStorage) =>
  `# Architecture\n\n## 5. Subsystems\n\n| Subsystem | Module | Phase 1 | Increment |\n` +
  `| --- | --- | --- | --- |\n` +
  `| Ports | packages/ports | ✅ | 1 |\n` +
  `| Storage | packages/adapters | ✅ | ${incrementForStorage} |\n` +
  `| Search | packages/search | ❌ | deferred |\n`;

function runOn(archBody) {
  const dir = mkdtempSync(join(tmpdir(), 'subsys-'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs/ARCHITECTURE.md'), archBody);
  writeFileSync(join(dir, 'docs/ROADMAP.md'), ROADMAP);
  return spawnSync(process.execPath, [CHECKER, dir], { encoding: 'utf8' });
}

test('TC-315 the subsystem checker passes when every in-scope subsystem names a real increment', () => {
  const r = runOn(arch('2'));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /2\/2 Phase-1 subsystems are assigned/);
  // The deferred subsystem must not be counted as in scope, or the checker inflates itself.
  assert.doesNotMatch(r.stdout, /Search/);
});

test('TC-316 the checker FAILS when an in-scope subsystem names no increment', () => {
  const r = runOn(arch('—'));
  assert.equal(r.status, 1, 'a subsystem with no increment must fail the build, not warn');
  assert.match(r.stdout, /Storage .* names NO increment/);
});

test('TC-317 the checker FAILS when a subsystem names an increment that does not exist', () => {
  const r = runOn(arch('7'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /names increment 7, which is not in ROADMAP\.md/);
});

test('TC-318 the checker passes against this repository as it stands', () => {
  const r = spawnSync(process.execPath, [CHECKER, REPO], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});
