/**
 * Vector index adapters. REQ-110, REQ-051 (derived and rebuildable from canonical).
 *
 * Two implementations behind one port, for the same reason the store has three: the
 * pipeline must be exercisable without an account, and DEF-009 taught that a port proved
 * by adapters of the same shape is not proved at all. Both are asynchronous.
 *
 * The index is DERIVED. Losing it costs an embedding run, never a record — canonical is
 * the only thing backed up (DATABASE.md §1).
 */

/** Cloudflare Vectorize. Created with `wrangler vectorize create <name> --dimensions=768 --metric=cosine`. */
export class VectorizeIndex {
  #binding; #dims;

  constructor(binding, { dimensions = 768 } = {}) {
    if (!binding || typeof binding.upsert !== 'function' || typeof binding.query !== 'function') {
      throw new TypeError('VectorizeIndex requires a Vectorize binding (env.VECTORS)');
    }
    this.#binding = binding;
    this.#dims = dimensions;
  }

  describe() { return { kind: 'vectorize', dimensions: this.#dims }; }

  /** @param {{id: string, values: number[], metadata?: object}[]} vectors */
  async upsert(vectors) {
    for (const v of vectors) {
      if (v.values.length !== this.#dims) {
        // Vectorize fixes dimensionality at creation, so a mismatch here is a silent
        // corruption waiting to happen rather than a recoverable error.
        throw new Error(`vector ${v.id} has ${v.values.length} dimensions, index expects ${this.#dims}`);
      }
    }
    return this.#binding.upsert(vectors);
  }

  async query(values, { topK = 10 } = {}) {
    const res = await this.#binding.query(values, { topK, returnMetadata: true });
    return (res?.matches ?? []).map((m) => ({ id: m.id, score: m.score, metadata: m.metadata ?? {} }));
  }
}

/**
 * In-memory cosine index. Exact, not approximate — which makes it the ORACLE for the
 * Vectorize adapter rather than merely a stand-in: for a small set, brute-force cosine is
 * the correct answer that an ANN index approximates.
 */
export class MemoryVectorIndex {
  #dims; #vectors = new Map();

  constructor({ dimensions = 768 } = {}) { this.#dims = dimensions; }
  describe() { return { kind: 'memory', dimensions: this.#dims, size: this.#vectors.size }; }

  async upsert(vectors) {
    for (const v of vectors) {
      if (v.values.length !== this.#dims) {
        throw new Error(`vector ${v.id} has ${v.values.length} dimensions, index expects ${this.#dims}`);
      }
      this.#vectors.set(v.id, { values: Float64Array.from(v.values), metadata: v.metadata ?? {} });
    }
    return { mutationId: `mem-${this.#vectors.size}` };
  }

  async query(values, { topK = 10 } = {}) {
    const q = Float64Array.from(values);
    const qn = Math.hypot(...q) || 1;
    const scored = [];
    for (const [id, { values: v, metadata }] of this.#vectors) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += q[i] * v[i];
      const vn = Math.hypot(...v) || 1;
      scored.push({ id, score: dot / (qn * vn), metadata });
    }
    // Ties broken by id so the ordering is deterministic — NFR-001 applies to derived
    // indexes too, and an unstable sort would make a rebuild non-reproducible.
    scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
    return scored.slice(0, topK);
  }
}
