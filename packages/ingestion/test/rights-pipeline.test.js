import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkill, normalise, fingerprint, resolveOccurrence } from '../src/index.js';
import { SqliteCanonicalStore } from '../../adapters/sqlite/src/index.js';
import { RIGHTS_STATE, UNKNOWN } from '../../skill-core/src/index.js';

const NOW = '2026-08-27T13:45:00Z';
const rig = async () => { const s = new SqliteCanonicalStore(':memory:'); await s.migrate({ now: NOW }); return s; };
const disco = (repo) => ({ source: 'gitskills', external_id: `${repo}:SKILL.md`,
  repo_full_name: repo, path: 'SKILL.md', author: repo.split('/')[0],
  url: `https://github.com/${repo}/blob/HEAD/SKILL.md`, discovered_at: NOW, source_payload: {} });

async function ingest(store, repo, raw, repoLicence) {
  const d = disco(repo);
  const canonical = normalise({ discovery: d, parsed: parseSkill(raw), rawText: raw, repoLicence, now: NOW });
  await resolveOccurrence({ store, discovery: d, canonical, fingerprints: fingerprint(raw), now: NOW });
  return canonical;
}
const skill = (n, lic = null) =>
  `---\nname: ${n}\ndescription: d\n${lic ? `license: ${lic}\n` : ''}---\nBody ${n}.`;

test('TC-138 DEC-009 the corpus reality: no repository licence means UNKNOWN, not permitted', async () => {
  // Measured on real data: 62% of repositories carry no licence at all, and 68.7%
  // of sampled skills resolve to UNKNOWN. Defaulting "public" to "redistributable"
  // would have mislabelled roughly two thirds of the corpus.
  const s = await rig();
  const c = await ingest(s, 'a/no-licence', skill('a'), null);
  assert.equal(c.rights.state, RIGHTS_STATE.UNKNOWN);
  assert.equal(c.rights.redistributable, false);
  assert.equal(c.licence.l2_repository.spdx, UNKNOWN);
  s.close();
});

test('TC-139 REQ-057 NOASSERTION is UNKNOWN, never a guess', async () => {
  // GitHub emits NOASSERTION when a licence file exists but is unrecognised.
  // It appeared 4 times in a 131-record real sample.
  const s = await rig();
  const c = await ingest(s, 'a/noassert', skill('a'), 'NOASSERTION');
  assert.equal(c.licence.l2_repository.spdx, UNKNOWN);
  assert.equal(c.rights.state, RIGHTS_STATE.UNKNOWN);
  s.close();
});

test('TC-140 NFR-006 the store holds no redistributable record lacking L2 evidence', async () => {
  const s = await rig();
  await ingest(s, 'a/mit', skill('a'), 'MIT');
  await ingest(s, 'b/none', skill('b'), null);
  await ingest(s, 'c/gpl', skill('c'), 'GPL-3.0');
  await ingest(s, 'd/claim', skill('d', 'MIT'), null);        // L3 claim, no L2
  const rows = (await s.cursorScan({ limit: 100 })).rows;
  assert.equal(rows.length, 4);
  for (const r of rows) {
    if (r.rights_redistributable) {
      assert.notEqual(JSON.parse(r.licence_json).l2_repository.spdx, UNKNOWN,
        `${r.attribution_repository} claims redistributable without L2 evidence`);
    }
  }
  assert.equal(rows.filter((r) => r.rights_redistributable).length, 1, 'only the MIT repo');
  s.close();
});

test('TC-141 DEC-018 an L3 claim without L2 backing yields UNKNOWN, not the claimed licence', async () => {
  const s = await rig();
  const c = await ingest(s, 'a/claim', skill('a', 'MIT'), null);
  assert.equal(c.licence.l3_declared.spdx, 'MIT', 'the claim is recorded');
  assert.equal(c.licence.l2_repository.spdx, UNKNOWN);
  assert.equal(c.rights.state, RIGHTS_STATE.UNKNOWN, 'but it does not establish a licence');
  assert.match(c.rights.basis, /claim is not authority/);
  s.close();
});

test('TC-142 REQ-060 a real L2/L3 conflict is flagged and resolved to the more restrictive', async () => {
  const s = await rig();
  const c = await ingest(s, 'a/conflict', skill('a', 'MIT'), 'AGPL-3.0');
  assert.equal(c.licence.conflict, true);
  assert.equal(c.licence.effective, 'AGPL-3.0');
  assert.equal(c.rights.redistributable, false);
  assert.equal(JSON.parse((await s.cursorScan()).rows[0].licence_json).l3_declared.spdx, 'MIT',
    'both layers survive into storage');
  s.close();
});

test('TC-143 DEC-019 retention follows rights, and unknown gets the shortest', async () => {
  const s = await rig();
  assert.equal((await ingest(s, 'a/none', skill('a'), null)).retentionPolicy, 'process-then-delete');
  assert.equal((await ingest(s, 'b/gpl', skill('b'), 'GPL-3.0')).retentionPolicy, 'short');
  assert.equal((await ingest(s, 'c/mit', skill('c'), 'MIT')).retentionPolicy, 'standard');
  s.close();
});

test('TC-144 NFR-004/NFR-025 attribution survives the whole pipeline into storage', async () => {
  const s = await rig();
  await ingest(s, 'owner/repo', skill('a'), 'MIT');
  const r = (await s.cursorScan()).rows[0];
  assert.equal(r.attribution_repository, 'owner/repo');
  assert.equal(r.attribution_owner, 'owner');
  assert.match(r.attribution_url, /^https:\/\/github\.com\/owner\/repo/);
  s.close();
});

test('TC-145 NFR-005 every stored field origin is classifiable as fact or inference', async () => {
  const s = await rig();
  await ingest(s, 'a/one', skill('a'), 'MIT');
  const fo = JSON.parse((await s.cursorScan()).rows[0].provenance_json).field_origins;
  assert.ok(Object.keys(fo).length > 0);
  for (const [k, v] of Object.entries(fo)) {
    assert.match(v, /^(source_fact|appmd_inference):/, `${k} must be classified`);
  }
  assert.match(fo['rights.redistributable'], /^appmd_inference:/,
    'a rights conclusion is ours, never the source\'s');
});
