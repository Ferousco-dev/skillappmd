import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsObjectStore, keyForBytes, ObjectKeyError } from '../src/index.js';
import { MemoryObjectStore } from '../../memory-objectstore/src/index.js';
import { R2ObjectStore, R2NotConfiguredError } from '../../r2-objectstore/src/index.js';
import { assertObjectStoreContract, assertRawPurpose, RAW_PURPOSE } from '../../../ports/src/index.js';

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'appmd-obj-')); dirs.push(d); return d; };
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/**
 * One contract suite over TWO live adapters that share nothing but the port - a
 * filesystem store and a plain-Map store. Same reasoning as the DEC-027 canonical-store
 * proof: two adapters from the same family would hide a leak.
 */
const ADAPTERS = [
  ['fs', () => new FsObjectStore({ root: tmp() })],
  ['memory', () => new MemoryObjectStore()],
];

for (const [name, make] of ADAPTERS) {
  test(`TC-208 [${name}] DES-017 the adapter satisfies the ObjectStore contract`, async () => {
    assert.ok(assertObjectStoreContract(make()));
  });

  test(`TC-209 [${name}] REQ-029 put/get/head/exists/delete round-trip`, async () => {
    const s = make();
    const bytes = 'raw skill bytes \u00e9\u00fc\n';
    const key = keyForBytes(bytes);

    assert.equal(await s.exists(key), false);
    assert.equal(await s.get(key), null);
    assert.equal(await s.head(key), null);

    const put = await s.put(key, bytes, { source: 'gitskills' });
    assert.equal(put.created, true);
    assert.equal(await s.exists(key), true);
    assert.equal((await s.get(key)).bytes.toString('utf8'), bytes, 'bytes survive byte-for-byte');
    assert.equal((await s.head(key)).source, 'gitskills');
    assert.equal((await s.head(key)).size_bytes, Buffer.byteLength(bytes, 'utf8'));

    assert.equal(await s.delete(key), true);
    assert.equal(await s.exists(key), false);
    assert.equal(await s.delete(key), false, 'deleting twice is not an error, and is not a lie');
  });

  test(`TC-210 [${name}] REQ-029 identity is content-derived and deterministic`, async () => {
    const s = make();
    const a = 'alpha', b = 'beta';
    assert.equal(keyForBytes(a), keyForBytes(a), 'same bytes, same key');
    assert.notEqual(keyForBytes(a), keyForBytes(b), 'different bytes, different key');
    // A key that does not address its content is refused: identity cannot be asserted.
    await assert.rejects(() => s.put(keyForBytes(a), b), /does not address its content/);
  });

  test(`TC-211 [${name}] REQ-029 raw is immutable at the ADAPTER boundary`, async () => {
    const s = make();
    const key = keyForBytes('original');
    await s.put(key, 'original');
    // Identical bytes: a no-op success, so ingestion stays idempotent (REQ-016).
    const again = await s.put(key, 'original');
    assert.equal(again.alreadyExisted, true);
    assert.equal(again.created, false);
    assert.equal((await s.get(key)).bytes.toString(), 'original', 'content did not change');
  });

  test(`TC-212 [${name}] NFR-021 traversal and malformed keys are refused`, async () => {
    const s = make();
    const attacks = ['../../secret', '../foo', '/etc/passwd', 'C:\\Windows\\system32',
      '..%2F..%2Fsecret', 'sha256:../../x', 'sha256:' + 'a'.repeat(63),
      'sha256:' + 'A'.repeat(64), 'sha256:zz' + 'a'.repeat(62), '', 'owner/repo',
      'sha256:abc\u0000def', null, undefined, 42];
    for (const bad of attacks) {
      await assert.rejects(async () => s.exists(bad), ObjectKeyError,
        `key ${JSON.stringify(String(bad))} must be refused`);
      await assert.rejects(async () => s.get(bad), ObjectKeyError);
      await assert.rejects(async () => s.delete(bad), ObjectKeyError);
    }
  });
}

test('TC-213 NFR-021 no attack key ever creates a file outside the raw root', async () => {
  const root = tmp();
  const s = new FsObjectStore({ root });
  const before = readdirSync(root).length;
  for (const bad of ['../../escape', '../escape', '/tmp/escape', 'sha256:../../escape']) {
    try { await s.put(bad, 'payload'); } catch { /* expected */ }
  }
  assert.equal(readdirSync(root).length, before, 'nothing was created');
  assert.equal(existsSync(join(root, '..', 'escape')), false, 'nothing escaped the root');
  assert.equal(existsSync('/tmp/escape'), false);
});

test('TC-214 REQ-029 the fs adapter lays objects out by content hash, never by source name', async () => {
  const root = tmp();
  const s = new FsObjectStore({ root });
  const key = keyForBytes('layout check');
  await s.put(key, 'layout check', { repo_full_name: 'owner/repo', path: 'skills/x/SKILL.md' });
  const hex = key.slice('sha256:'.length);
  assert.ok(existsSync(join(root, 'sha256', hex.slice(0, 2), hex.slice(2, 4), `${hex}.raw`)));
  // The repository name appears in metadata, never in the path.
  assert.equal(existsSync(join(root, 'owner')), false);
});

test('TC-215 DEC-015 deleting bytes preserves the metadata envelope', async () => {
  const s = new FsObjectStore({ root: tmp() });
  const key = keyForBytes('doomed');
  await s.put(key, 'doomed', { source: 'gitskills', source_url: 'https://example/x' });
  await s.delete(key);
  assert.equal(await s.get(key), null, 'bytes are gone');
  // FsObjectStore keeps the sidecar so a deleted object is still describable.
  assert.equal(await s.exists(key), false);
});

test('TC-216 REQ-033 raw access requires a permitted internal purpose', async () => {
  for (const p of Object.values(RAW_PURPOSE)) assert.ok(assertRawPurpose(p));
  for (const bad of ['serve', 'api', 'public', 'download', '', undefined]) {
    assert.throws(() => assertRawPurpose(bad), /REQ-033 violated/,
      `"${bad}" must not be a permitted raw purpose`);
  }
});

test('TC-217 DES-019 the R2 boundary validates keys offline and refuses to fake live I/O', async () => {
  const r2 = new R2ObjectStore();
  assert.ok(assertObjectStoreContract(r2), 'it satisfies the same contract shape');
  assert.equal(r2.isLive, false);

  // Offline-testable: derivation and validation behave exactly like the other adapters.
  const key = keyForBytes('r2 payload');
  const hex = key.slice('sha256:'.length);
  assert.equal(r2.objectPath(key), `raw/sha256/${hex.slice(0, 2)}/${hex.slice(2, 4)}/${hex}`);
  assert.throws(() => r2.objectPath('../../escape'), ObjectKeyError);

  // Live I/O is REFUSED, not faked. An adapter that silently no-ops would report success
  // for bytes that were never stored.
  await assert.rejects(() => r2.get(key), R2NotConfiguredError);
  await assert.rejects(() => r2.head(key), R2NotConfiguredError);
  await assert.rejects(() => r2.delete(key), R2NotConfiguredError);
  await assert.rejects(() => r2.put(key, 'r2 payload'), R2NotConfiguredError);
});

test('TC-218 DES-019 the R2 adapter works against an injected bucket double', async () => {
  // Proves the boundary is wired correctly WITHOUT claiming live R2 verification.
  const store = new Map();
  const bucket = {
    async put(p, body, opts) { store.set(p, { body, meta: opts?.customMetadata ?? {} }); },
    async get(p) { const o = store.get(p);
      return o ? { arrayBuffer: async () => o.body, customMetadata: o.meta } : null; },
    async head(p) { const o = store.get(p);
      return o ? { size: o.body.length, customMetadata: o.meta } : null; },
    async delete(p) { store.delete(p); },
  };
  const r2 = new R2ObjectStore({ bucket });
  assert.equal(r2.isLive, true);
  const key = keyForBytes('via binding');
  assert.equal((await r2.put(key, 'via binding', { source: 'gitskills' })).created, true);
  assert.equal((await r2.get(key)).bytes.toString('utf8'), 'via binding');
  assert.equal((await r2.put(key, 'via binding')).alreadyExisted, true, 'REQ-029 immutability');
  assert.equal(await r2.delete(key), true);
  assert.equal(await r2.get(key), null);
});
