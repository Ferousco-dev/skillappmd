/**
 * REQ-100..REQ-105. The installer.
 *
 * The load-bearing test here is TC-334: `init` must make NO network request. Every other
 * property of this package is a convenience; that one is the product's central claim
 * ("you are installing the resolver, not the index") and it is the one a future change
 * could break without anybody noticing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, resolveTarget, apiBase, SOURCE_SKILL } from '../src/install.js';
import { run } from '../src/cli.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'skillappmd-'));

test('TC-331 REQ-100 init writes exactly one skill into the agent skills directory', () => {
  const home = tmp();
  const r = install({ home });
  assert.equal(r.written, true);
  assert.equal(r.path, join(home, '.claude', 'skills', 'skillappmd', 'SKILL.md'),
    'the verified Claude Code layout, not an invented one');
  const body = readFileSync(r.path, 'utf8');
  assert.match(body, /^---\nname: skillappmd\n/, 'the frontmatter name is how the agent addresses it');
});

test('TC-332 REQ-101 an existing installation is never replaced silently', () => {
  const home = tmp();
  install({ home });
  writeFileSync(resolveTarget({ home }).path, 'MINE\n');

  const second = install({ home });
  assert.equal(second.written, false, 'a second init must refuse');
  assert.match(second.reason, /--force/);
  assert.equal(readFileSync(second.path, 'utf8'), 'MINE\n', 'the user edit survived');

  const forced = install({ home, force: true });
  assert.equal(forced.written, true);
  assert.equal(forced.reason, 'replaced');
  assert.notEqual(readFileSync(forced.path, 'utf8'), 'MINE\n');
});

test('TC-333 REQ-100 project scope and an explicit directory are both honoured', () => {
  const home = tmp(), cwd = tmp();
  assert.equal(install({ home, cwd, project: true }).path,
               join(cwd, '.claude', 'skills', 'skillappmd', 'SKILL.md'));

  const other = tmp();
  const r = install({ home, cwd, dir: other });
  assert.equal(r.path, join(other, 'skillappmd', 'SKILL.md'),
    '--dir exists so agents other than Claude Code need no invented path');
  assert.ok(existsSync(r.path));
});

test('TC-334 REQ-104 init performs NO network request — it installs a pointer, not a corpus', async () => {
  // The claim the whole product rests on. Any fetch at install time means the installer
  // has started doing the resolver's job, which is the failure this test exists to catch.
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (...args) => { calls++; throw new Error(`init attempted a network call: ${args[0]}`); };
  try {
    const home = tmp();
    const r = install({ home });
    assert.equal(r.written, true);
    assert.equal(calls, 0, 'init must not contact the network');
    // and the installed file must be small: it is instructions, never data
    assert.ok(r.bytes < 16 * 1024, `installed ${r.bytes} bytes; a corpus would be far larger`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('TC-335 REQ-102/REQ-103 the skill carries the rights rules and the origin-fetch rule with it', () => {
  const body = readFileSync(SOURCE_SKILL, 'utf8');
  // These are not decoration. The skill is the only thing present at the moment the agent
  // decides whether to copy somebody's file, so the rules have to travel inside it.
  assert.match(body, /AppMD serves no skill content/i, 'REQ-062 must be stated to the agent');
  assert.match(body, /canonical_source_url/, 'the agent is told where to fetch from');
  assert.match(body, /`unknown` is not permission/, 'DEC-018 travels with the skill');
  assert.match(body, /redistributable/, 'REQ-103 redistribution rule');
  assert.match(body, /certifies nothing/i, 'ETH-001: indexing is not endorsement');
});

test('TC-336 REQ-105 the API base is overridable so the resolver is testable before deployment', () => {
  assert.equal(apiBase({}), 'https://skill.appmd.dev');
  assert.equal(apiBase({ APPMD_API: 'http://localhost:8787' }), 'http://localhost:8787');
});

test('TC-337 REQ-101 the CLI reports the exact path and exits non-zero when it refuses', () => {
  const home = tmp();
  const lines = [];
  const log = (m = '') => lines.push(String(m));
  const errors = [];

  assert.equal(run(['init'], { log, error: (m) => errors.push(String(m)), home }), 0);
  assert.equal(errors.length, 0);
  assert.ok(lines.some((l) => l.includes(join(home, '.claude', 'skills', 'skillappmd', 'SKILL.md'))),
    'the CLI must print the exact path it wrote');

  // Refusing must be visible to a shell: message on stderr AND a non-zero exit.
  const again = run(['init'], { log, error: (m) => errors.push(String(m)), home });
  assert.equal(again, 1, 'a refusal must exit non-zero');
  assert.ok(errors.some((e) => /--force/.test(e)));

  // `where` and the install path must agree, or the user cannot find what was written.
  const shown = [];
  run(['where'], { log: (m) => shown.push(String(m)), error: () => {}, home });
  assert.equal(shown[0], resolveTarget({ home }).path);
});

test('TC-338 REQ-100 the installer refuses a skill whose frontmatter name has drifted', () => {
  // A wrong `name` installs successfully and is then never found by the agent: the
  // installer succeeds and the product silently does nothing.
  const home = tmp(), src = join(tmp(), 'SKILL.md');
  writeFileSync(src, '---\nname: something-else\ndescription: x\n---\nbody\n');
  assert.throws(() => install({ home, source: src }), /name: skillappmd/);
});
