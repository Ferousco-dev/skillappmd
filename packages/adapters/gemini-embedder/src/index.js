/**
 * Gemini embedding adapter. REQ-111, NFR-015 (as amended by CR-010), NFR-042.
 *
 * Verified against Google's documentation 2026-08-27:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent
 *   body { content: { parts: [{ text }] }, taskType, outputDimensionality }
 *   `gemini-embedding-001` supports outputDimensionality across 128-3072.
 *
 * TWO THINGS THAT ARE NOT COSMETIC.
 *
 * 1 `taskType` differs between indexing and querying. A document is embedded as
 *   RETRIEVAL_DOCUMENT and a query as RETRIEVAL_QUERY. Embedding both the same way is
 *   the standard way to build a semantic search that quietly underperforms — it still
 *   returns results, so nothing looks broken.
 *
 * 2 768 dimensions, not the 3072 default. Storage is linear in dimensions, so this is a
 *   4x cost difference (~$0.73/mo against ~$2.92), and Vectorize CANNOT change an index's
 *   dimensionality after creation. It is a one-way decision, made deliberately.
 *
 * THE KEY IS NEVER LOGGED. It is read from the environment, held in a private field, and
 * this class has no method that returns it. Errors report status codes, never the request.
 */
import { assertEmbedderConfigured } from '../../../ports/src/index.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const TASK = Object.freeze({
  DOCUMENT: 'RETRIEVAL_DOCUMENT',
  QUERY: 'RETRIEVAL_QUERY',
});

export class GeminiEmbedder {
  #key; #model; #dims; #fetch; #calls = 0; #tokensIn = 0;

  constructor({ apiKey, model = 'gemini-embedding-001', dimensions = 768, fetchImpl = fetch } = {}) {
    if (typeof apiKey !== 'string' || apiKey === '') {
      // NFR-042: a missing key stops the process. Falling back to keyword search would
      // make a degraded system look like a working one.
      throw new Error('GEMINI_API_KEY is not set. Refusing to start: a missing key must ' +
                      'not silently degrade semantic resolution to keyword search (NFR-042).');
    }
    this.#key = apiKey;
    this.#model = model;
    this.#dims = dimensions;
    this.#fetch = fetchImpl;
  }

  modelId() { return this.#model; }
  dimensions() { return this.#dims; }
  /** For the run report and the budget check. Never includes the key. */
  usage() { return { calls: this.#calls, approxTokensIn: this.#tokensIn }; }

  /**
   * @param {string[]} texts
   * @param {{taskType?: string}} opts
   * @returns {Promise<number[][]>} one vector per input, in input order
   */
  async embed(texts, { taskType = TASK.DOCUMENT } = {}) {
    const out = [];
    for (const text of texts) {
      this.#tokensIn += Math.ceil(text.length / 4);   // rough, for the budget report only
      const res = await this.#fetch(`${ENDPOINT}/${this.#model}:embedContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.#key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.#model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.#dims,
        }),
      });
      this.#calls++;

      if (!res.ok) {
        // Report the status, never the request: the body carries the key header's effect
        // and the text being embedded.
        throw new Error(`embedding request failed: HTTP ${res.status}`);
      }
      const body = await res.json();
      const values = body?.embedding?.values;
      if (!Array.isArray(values) || values.length !== this.#dims) {
        throw new Error(`embedding response malformed: expected ${this.#dims} values, got ${values?.length}`);
      }
      out.push(values);
    }
    return out;
  }
}

/**
 * A deterministic embedder with no network and no spend.
 *
 * Not a stub that returns zeros: it hashes the text into a stable unit vector, so similar
 * inputs are NOT similar and identical inputs ARE identical. That is enough to test every
 * property of the pipeline that is not about semantic quality — ordering, dimensionality,
 * idempotence, resumability, provenance — which is all of it except the ranking itself.
 *
 * Semantic QUALITY cannot be faked and is not claimed here (`RSK-012`).
 */
export class FakeEmbedder {
  #dims;
  constructor({ dimensions = 768 } = {}) { this.#dims = dimensions; }
  modelId() { return 'fake-embedder@1'; }
  dimensions() { return this.#dims; }

  async embed(texts) {
    return texts.map((text) => {
      let h = 2166136261;
      const v = new Array(this.#dims);
      for (let i = 0; i < this.#dims; i++) {
        for (let c = 0; c < text.length; c++) {
          h ^= text.charCodeAt(c) + i;
          h = Math.imul(h, 16777619);
        }
        v[i] = ((h >>> 0) / 0xffffffff) * 2 - 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}

export { assertEmbedderConfigured };
