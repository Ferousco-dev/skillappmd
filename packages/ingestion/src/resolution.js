/**
 * Semantic resolution. REQ-110, REQ-112, NFR-041.
 *
 * The task→capability path the resolver skill actually needs. Keyword search answers
 * "which record contains this word"; this answers "which skill does this job", which is
 * the question an agent is in a position to ask.
 */
import { embeddingKey } from '../../ports/src/index.js';

/**
 * What gets embedded for a record.
 *
 * Name and description, NOT the body. Three reasons, in order of weight:
 *   1 the description is what the author wrote to say what the skill does — it is the
 *     closest thing in the corpus to the query an agent will send
 *   2 bodies average 4,425 bytes; embedding them is ~5x the token cost for text that is
 *     mostly instructions to a model rather than a statement of capability
 *   3 REQ-062 — we do not serve bodies, and embedding one puts a derived representation
 *     of unlicensed content into a store we control. The description is metadata; the
 *     body is the work.
 */
export function embeddableText(record) {
  const name = record.declared_name ?? record.declared?.name ?? '';
  const description = record.declared_description ?? record.declared?.description ?? '';
  return [name, description].filter(Boolean).join(' — ').trim();
}

/**
 * NFR-041: resumable and reproducible. Keyed on normalised_hash + model + dimensions, so
 * re-running embeds only what changed, and a model change re-embeds everything on purpose
 * rather than mixing vector spaces — which would silently ruin ranking without any error.
 */
export function planEmbedding({ records, embedder, alreadyEmbedded = new Set() }) {
  const model = embedder.modelId();
  const dims = embedder.dimensions();
  const todo = [], skipped = [];
  for (const r of records) {
    const text = embeddableText(r);
    if (!text) { skipped.push({ id: r.id, reason: 'no name or description to embed' }); continue; }
    const key = embeddingKey(r.normalised_hash, model, dims);
    (alreadyEmbedded.has(key) ? skipped : todo).push({ id: r.id, key, text, record: r });
    if (alreadyEmbedded.has(key)) skipped[skipped.length - 1].reason = 'already embedded';
  }
  return { model, dimensions: dims, todo, skipped };
}

/** Embeds and upserts. Batched so one slow call cannot hold the whole run. */
export async function embedRecords({ records, embedder, index, batchSize = 64, alreadyEmbedded }) {
  const plan = planEmbedding({ records, embedder, alreadyEmbedded });
  let embedded = 0;
  for (let i = 0; i < plan.todo.length; i += batchSize) {
    const chunk = plan.todo.slice(i, i + batchSize);
    const vectors = await embedder.embed(chunk.map((c) => c.text));
    await index.upsert(chunk.map((c, n) => ({
      id: c.id,
      values: vectors[n],
      // Metadata stays minimal and non-identifying: enough to rank and explain, never a
      // second copy of the record. The canonical store remains the source of truth.
      metadata: { normalised_hash: c.record.normalised_hash, rights_state: c.record.rights_state },
    })));
    embedded += chunk.length;
  }
  return { model: plan.model, dimensions: plan.dimensions, embedded, skipped: plan.skipped };
}

/**
 * REQ-110 / REQ-112. Resolve a task description to candidates.
 *
 * The similarity floor is deliberate. Cosine always returns a nearest neighbour, so
 * without one this endpoint would answer EVERY question confidently — including questions
 * the corpus has no answer to. Returning nothing is a legitimate answer and the resolver
 * skill already tells the agent what to do with it: write the capability yourself.
 */
export async function resolveTask({ task, embedder, index, store, topK = 10, floor = 0.35 }) {
  if (typeof task !== 'string' || task.trim() === '') {
    throw new Error('MISSING_TASK: resolve requires a task description');
  }
  const [query] = await embedder.embed([task], { taskType: 'RETRIEVAL_QUERY' });
  const matches = await index.query(query, { topK });

  const kept = matches.filter((m) => m.score >= floor);
  const rows = [];
  for (const m of kept) {
    const row = await store.getCanonical(m.id);
    if (!row) continue;   // index is derived and may lead canonical after a removal
    rows.push({ row, score: m.score });
  }

  return {
    rows,
    // REQ-112: a ranking is an AppMD judgement, never a source fact, and it travels with
    // the analyser that produced it.
    inference: {
      analyser: 'semantic-resolver',
      model: embedder.modelId(),
      dimensions: embedder.dimensions(),
      floor,
      considered: matches.length,
      below_floor: matches.length - kept.length,
    },
  };
}
