import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ingestRecord, rebuildSearchIndex } from '../../../packages/ingestion/src/index.js';
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { FsObjectStore } from '../../../packages/adapters/fs-objectstore/src/index.js';

/**
 * SYSTEM LEVEL — the whole thing against the SRS, driven the way an operator drives it.
 *
 * These run the real CLI as a child process. Nothing is imported and called directly,
 * so argument parsing, exit codes, confirmation guards and output formatting are all in
 * scope - the parts unit and integration tests structurally cannot reach.
 */
const NOW = '2026-08-27T13:45:00Z';
const CLI = resolve('apps/cli/src/appmd.mjs');
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'appmd-sys-')); dirs.push(d); return d; };
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Runs the CLI exactly as an operator would, capturing status, stdout and stderr. */
function cli(args, { expectFail = false } = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (expectFail) assert.fail(`expected a non-zero exit for: ${args.join(' ')}`);
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    if (!expectFail) assert.fail(`unexpected failure for "${args.join(' ')}":\n${e.stderr || e.message}`);
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function seeded({ records = 12 } = {}) {
  const dir = tmp();
  const db = join(dir, 'appmd.db');
  const rawRoot = join(dir, 'raw');
  const store = new SqliteCanonicalStore(db);
  store.migrate({ now: NOW });
  const objects = new FsObjectStore({ root: rawRoot });
  const ids = [];
  for (let i = 0; i < records; i++) {
    const raw = `---\nname: sys-${i}\ndescription: System test record ${i}.\n---\nBody ${i}.`;
    const r = await ingestRecord({ store, objects,
      discovery: { source: 'gitskills', external_id: `o/r${i}:S.md`, repo_full_name: `o/r${i}`,
        path: 'S.md', author: 'o', url: `https://github.com/o/r${i}/blob/HEAD/S.md`,
        discovered_at: `2026-08-27T13:${String(i).padStart(2, '0')}:00Z`,
        version_ref: `sha-${i}`, source_payload: { file_sha: `sha-${i}` } },
      rawText: raw, repoLicence: i % 2 === 0 ? 'MIT' : null, now: NOW });
    ids.push(r);
  }
  rebuildSearchIndex({ store, now: NOW });
  store.close();
  return { dir, db, rawRoot, ids };
}

test('TC-265 REQ-088/REQ-089 an operator drives the system from the CLI with no frontend', async () => {
  const { db, rawRoot, ids } = await seeded();

  const doctor = cli(['doctor', '--db', db]);
  assert.match(doctor.stdout, /schema version\s+3/);
  assert.match(doctor.stdout, /canonical\s+12/);

  const list = cli(['skill', 'list', '--db', db, '--limit', '5']);
  assert.match(list.stdout, /sys-/);

  const get = cli(['skill', 'get', ids[0].canonicalId, '--db', db]);
  assert.match(get.stdout, /repository\s+o\/r0/);
  assert.match(get.stdout, /rights\s+known/);

  const sources = cli(['source', 'list']);
  assert.match(sources.stdout, /gitskills/);
  assert.match(sources.stdout, /CC-BY-4\.0/, 'the licence obligation is visible to the operator');

  const raw = cli(['raw', 'status', '--db', db, '--raw-root', rawRoot]);
  assert.match(raw.stdout, /retained\s+12/);
});

test('TC-266 REQ-089 machine-readable output is available for every read command', async () => {
  const { db, ids } = await seeded({ records: 4 });
  for (const args of [['skill', 'list'], ['skill', 'get', ids[0].canonicalId], ['doctor']]) {
    const r = cli([...args, '--db', db, '--json']);
    const parsed = JSON.parse(r.stdout);           // throws if it is not valid JSON
    assert.equal(typeof parsed, 'object');
  }
});

test('TC-267 UI-002 every destructive command refuses without --confirm and exits non-zero', async () => {
  const { db, rawRoot } = await seeded({ records: 3 });
  const destructive = [
    [['index', 'rebuild', '--db', db], /DESTROYS and rebuilds/],
    [['raw', 'retention', '--db', db, '--raw-root', rawRoot], /DELETES raw bytes/],
    [['backup', 'restore', '/tmp/nothing.db', '--db', db], /OVERWRITES/],
  ];
  for (const [args, expected] of destructive) {
    const r = cli(args, { expectFail: true });
    assert.equal(r.code, 2, `${args.join(' ')} must exit 2`);
    assert.match(r.stderr, expected);
    assert.match(r.stderr, /--confirm/, 'and must say how to proceed');
  }
});

test('TC-268 REQ-052 an operator rebuilds the derived index end to end', async () => {
  const { db } = await seeded({ records: 8 });
  const r = cli(['index', 'rebuild', '--confirm', '--db', db]);
  assert.match(r.stdout, /indexed\s+8/);
  assert.match(r.stdout, /excluded\s+0 tombstoned/);
  assert.match(r.stdout, /source contact: false/);
});

test('TC-269 REQ-090/REQ-034 an operator expires raw bytes and the state is observable', async () => {
  const { db, rawRoot } = await seeded({ records: 6 });
  const before = cli(['raw', 'status', '--db', db, '--raw-root', rawRoot, '--json']);
  assert.equal(JSON.parse(before.stdout).retained, 6);

  // Half the records have no licence -> unknown rights -> process-then-delete.
  const run = cli(['raw', 'retention', '--confirm', '--db', db, '--raw-root', rawRoot, '--json']);
  const res = JSON.parse(run.stdout);
  assert.ok(res.deleted >= 3, `expected the unknown-rights records to expire, got ${res.deleted}`);

  const after = JSON.parse(cli(['raw', 'status', '--db', db, '--raw-root', rawRoot, '--json']).stdout);
  assert.equal(after.deleted, res.deleted, 'the state change is visible to the operator');
  assert.equal(after.retained + after.deleted, 6, 'nothing was lost from the ledger');
});

test('TC-270 REQ-091 an operator takes and verifies a backup end to end', async () => {
  const { db, dir } = await seeded({ records: 5 });
  const out = join(dir, 'backup.db');
  const create = cli(['backup', 'create', '--db', db, '--out', out]);
  assert.match(create.stdout, /records 5/);
  assert.ok(existsSync(out));
  const verify = cli(['backup', 'verify', out, '--db', db]);
  assert.match(verify.stdout, /record count and digest match/);
});

test('TC-271 REQ-063 an operator processes an author removal end to end', async () => {
  const { db, ids } = await seeded({ records: 4 });
  cli(['removal', 'request', '--id', 'rq-sys', '--skill', ids[0].canonicalId,
       '--repo', 'o/r0', '--reason', 'no consent', '--by', 'author@example', '--db', db]);
  const listed = cli(['removal', 'list', '--repo', 'o/r0', '--db', db]);
  assert.match(listed.stdout, /rq-sys\s+pending/);

  const refused = cli(['removal', 'action', 'rq-sys', '--db', db], { expectFail: true });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /PRESERVED \(DEC-015\)/, 'it states what survives, not only what dies');

  const done = cli(['removal', 'action', 'rq-sys', '--confirm', '--db', db]);
  assert.match(done.stdout, /tombstoned\s+true/);

  // And the removal is reflected in a rebuilt index.
  const rebuilt = cli(['index', 'rebuild', '--confirm', '--db', db]);
  assert.match(rebuilt.stdout, /excluded\s+1 tombstoned/);
  assert.match(rebuilt.stdout, /MINUS 1 tombstoned/, 'NFR-010: never claims equivalence');
});

test('TC-272 REQ-095 an operator plans re-analysis and sees the blast radius', async () => {
  const { db } = await seeded({ records: 7 });
  const r = cli(['reanalyse', 'plan', '--analyser', 'security-scanner', '--version', '1.0.0', '--db', db]);
  assert.match(r.stdout, /affected records: 7/, 'never-analysed records are affected too');
  assert.match(r.stdout, /never analysed/);
});

test('TC-273 UI-005 an unknown command suggests the nearest one and exits non-zero', () => {
  for (const [typo, expected] of [['skil', 'skill'], ['bakup', 'backup'], ['reanalyze', 'reanalyse']]) {
    const r = cli([typo, 'list'], { expectFail: true });
    assert.equal(r.code, 2);
    assert.match(r.stderr, new RegExp(`Did you mean "${expected}"`));
  }
  const nonsense = cli(['zzzz'], { expectFail: true });
  assert.match(nonsense.stderr, /known nouns:/, 'and always lists what IS valid');
});

test('TC-274 REQ-072 the CLI reads through the same API surface a frontend would use', async () => {
  const { db, ids } = await seeded({ records: 3 });
  // The CLI's --json output IS the API envelope: same data, meta, notice.
  const body = JSON.parse(cli(['skill', 'get', ids[0].canonicalId, '--db', db, '--json']).stdout);
  assert.ok(body.data && body.meta && body.notice, 'the API envelope, not a bespoke CLI shape');
  assert.match(body.notice, /does not certify or verify/);
  assert.ok(body.data.attribution.canonical_source_url);
  assert.equal(body.data.content, null, 'REQ-062 holds through the CLI too');
});
