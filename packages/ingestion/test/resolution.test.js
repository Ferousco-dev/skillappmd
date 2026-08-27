/**
 * REQ-110, REQ-111, REQ-112, NFR-041, NFR-042. Semantic resolution.
 *
 * Every test here runs with NO network and NO spend, which is the point of REQ-111: the
 * provider is an adapter, so the pipeline is exercisable without a key. What these tests
 * cannot prove is ranking QUALITY — a fake embedder has no semantics (RSK-012).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiEmbedder, FakeEmbedder, TASK } from '../../adapters/gemini-embedder/src/index.js';
import { MemoryVectorIndex, VectorizeIndex } from '../../adapters/vector-index/src/index.js';
import { embeddableText, planEmbedding, embedRecords, resolveTask } from '../src/resolution.js';
import { embeddingKey } from '../../ports/src/index.js';

const rec = (id, name, description, hash = `nh_${id}`) => ({
  id, normalised_hash: hash, rights_state: 'known',
  declared_name: name, declared_description: description,
});

const RECORDS = [
  rec('cs_1', 'pdf-extract', 'Extract text and tables from scanned PDF documents.'),
  rec('cs_2', 'html-scrape', 'Parse HTML content and extract structured data.'),
  rec('cs_3', 'cf-deploy', 'Deploy a Worker to Cloudflare with D1 bindings.'),
];

const storeOf = (records) => ({
  async getCanonical(id) { return records.find((r) => r.id === id) ?? null; },
});

test('TC-354 NFR-042 a missing API key is a startup failure, never a silent downgrade', () => {
  // The failure mode this prevents: no key, so semantic search quietly becomes keyword
  // search, and the product looks like it works while answering worse.
  assert.throws(() => new GeminiEmbedder({ apiKey: '' }), /Refusing to start/);
  assert.throws(() => new GeminiEmbedder({}), /GEMINI_API_KEY is not set/);
});

test('TC-355 NFR-042 the embedder never exposes the key it holds', async () => {
  const e = new GeminiEmbedder({ apiKey: 'sk-secret-value', fetchImpl: async () => { throw new Error('no network'); } });
  const surface = JSON.stringify({ usage: e.usage(), model: e.modelId(), dims: e.dimensions() });
  assert.doesNotMatch(surface, /sk-secret-value/);
  assert.doesNotMatch(JSON.stringify(Object.keys(e)), /key/i);
  // and a failure must not carry the request that contained it
  await assert.rejects(() => e.embed(['x']), (err) => !/sk-secret-value/.test(err.message));
});

test('TC-356 REQ-111 documents and queries use DIFFERENT task types', async () => {
  // Embedding both the same way still returns results, so nothing looks broken - it just
  // ranks worse. That makes it exactly the kind of defect a test has to catch.
  const seen = [];
  const e = new GeminiEmbedder({
    apiKey: 'k', dimensions: 4,
    fetchImpl: async (_url, init) => {
      seen.push(JSON.parse(init.body).taskType);
      return { ok: true, json: async () => ({ embedding: { values: [0.5, 0.5, 0.5, 0.5] } }) };
    },
  });
  await e.embed(['a document']);
  await e.embed(['a query'], { taskType: TASK.QUERY });
  assert.deepEqual(seen, ['RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY']);
});

test('TC-357 REQ-111 the embedder requests 768 dimensions and rejects a wrong-sized reply', async () => {
  const e = new GeminiEmbedder({
    apiKey: 'k',
    fetchImpl: async (_u, init) => {
      assert.equal(JSON.parse(init.body).outputDimensionality, 768);
      return { ok: true, json: async () => ({ embedding: { values: [1, 2, 3] } }) };
    },
  });
  await assert.rejects(() => e.embed(['x']), /expected 768 values, got 3/);
});

test('TC-358 NFR-041 embedding is resumable: what is already embedded is not paid for twice', async () => {
  const embedder = new FakeEmbedder({ dimensions: 8 });
  const done = new Set([embeddingKey('nh_cs_1', embedder.modelId(), 8)]);
  const plan = planEmbedding({ records: RECORDS, embedder, alreadyEmbedded: done });
  assert.equal(plan.todo.length, 2);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].reason, 'already embedded');
});

test('TC-359 NFR-041 a model change re-embeds everything rather than mixing vector spaces', () => {
  // Two models produce incomparable vectors. Reusing old ones would ruin ranking with no
  // error anywhere - the search would simply be wrong.
  const a = new FakeEmbedder({ dimensions: 8 });
  const done = new Set(RECORDS.map((r) => embeddingKey(r.normalised_hash, a.modelId(), 8)));
  const different = { modelId: () => 'other-model@2', dimensions: () => 8, embed: a.embed.bind(a) };
  assert.equal(planEmbedding({ records: RECORDS, embedder: different, alreadyEmbedded: done }).todo.length, 3);
  // and a dimensionality change counts as a different space too
  const wider = { modelId: () => a.modelId(), dimensions: () => 16, embed: a.embed.bind(a) };
  assert.equal(planEmbedding({ records: RECORDS, embedder: wider, alreadyEmbedded: done }).todo.length, 3);
});

test('TC-360 REQ-062 the BODY is never embedded — only name and description', () => {
  const r = { ...rec('cs_9', 'a', 'does a thing'), body: 'SECRET BODY TEXT', content: 'SECRET BODY TEXT' };
  const text = embeddableText(r);
  assert.equal(text, 'a — does a thing');
  assert.doesNotMatch(text, /SECRET BODY/,
    'embedding a body puts a derived representation of unlicensed content in our store');
});

test('TC-361 REQ-110 resolve returns the matching record through the store', async () => {
  const embedder = new FakeEmbedder({ dimensions: 32 });
  const index = new MemoryVectorIndex({ dimensions: 32 });
  await embedRecords({ records: RECORDS, embedder, index });

  // A fake embedder has no semantics, so the only reliable query is the exact text.
  const { rows, inference } = await resolveTask({
    task: 'pdf-extract — Extract text and tables from scanned PDF documents.',
    embedder, index, store: storeOf(RECORDS), floor: 0.9,
  });
  assert.equal(rows[0].row.id, 'cs_1');
  assert.ok(rows[0].score > 0.99);
  assert.equal(inference.model, 'fake-embedder@1');
  assert.equal(inference.dimensions, 32);
});

test('TC-362 REQ-110 a task with no good match returns NOTHING, not the nearest neighbour', async () => {
  // Cosine always has a nearest neighbour. Without a floor this endpoint would answer
  // every question confidently, including ones the corpus cannot answer.
  const embedder = new FakeEmbedder({ dimensions: 32 });
  const index = new MemoryVectorIndex({ dimensions: 32 });
  await embedRecords({ records: RECORDS, embedder, index });

  const { rows, inference } = await resolveTask({
    task: 'something entirely unrelated to any indexed skill',
    embedder, index, store: storeOf(RECORDS), floor: 0.9,
  });
  assert.equal(rows.length, 0, 'no confident match must return no results');
  assert.ok(inference.below_floor > 0, 'and must record what it rejected');
});

test('TC-363 REQ-112 a ranking is recorded as AppMD inference, never as a source fact', async () => {
  const embedder = new FakeEmbedder({ dimensions: 16 });
  const index = new MemoryVectorIndex({ dimensions: 16 });
  await embedRecords({ records: RECORDS, embedder, index });
  const { inference } = await resolveTask({ task: 'anything', embedder, index, store: storeOf(RECORDS), floor: 0 });
  for (const k of ['analyser', 'model', 'dimensions', 'floor']) {
    assert.ok(k in inference, `${k} must travel with the judgement`);
  }
});

test('TC-364 REQ-110 the index refuses a vector of the wrong dimensionality', async () => {
  // Vectorize fixes dimensionality at creation, so a mismatch is silent corruption.
  const index = new MemoryVectorIndex({ dimensions: 8 });
  await assert.rejects(() => index.upsert([{ id: 'x', values: [1, 2, 3] }]), /expects 8/);

  const fakeBinding = { upsert: async () => ({}), query: async () => ({ matches: [] }) };
  const v = new VectorizeIndex(fakeBinding, { dimensions: 8 });
  await assert.rejects(() => v.upsert([{ id: 'x', values: [1, 2, 3] }]), /expects 8/);
  assert.throws(() => new VectorizeIndex(undefined), /Vectorize binding/);
});

test('TC-365 NFR-001 ranking order is deterministic when scores tie', async () => {
  const index = new MemoryVectorIndex({ dimensions: 4 });
  const same = [1, 0, 0, 0];
  await index.upsert([{ id: 'cs_b', values: same }, { id: 'cs_a', values: same }]);
  const first = await index.query(same, { topK: 2 });
  const second = await index.query(same, { topK: 2 });
  assert.deepEqual(first.map((m) => m.id), ['cs_a', 'cs_b'], 'ties break by id, not insertion order');
  assert.deepEqual(first.map((m) => m.id), second.map((m) => m.id));
});

test('TC-366 REQ-110 a record removed from canonical is not served from the stale index', async () => {
  // The vector index is derived and can lead canonical after a removal (REQ-063). The
  // resolver must not resurrect a tombstoned record.
  const embedder = new FakeEmbedder({ dimensions: 16 });
  const index = new MemoryVectorIndex({ dimensions: 16 });
  await embedRecords({ records: RECORDS, embedder, index });

  const withoutOne = RECORDS.filter((r) => r.id !== 'cs_1');
  const { rows } = await resolveTask({
    task: 'pdf-extract — Extract text and tables from scanned PDF documents.',
    embedder, index, store: storeOf(withoutOne), floor: 0,
  });
  assert.ok(!rows.some((r) => r.row.id === 'cs_1'), 'removed record must not be resolvable');
});
