/**
 * JsonlCorpusReader - the downstream half of the two-phase boundary (DEC-036).
 * Implements the CorpusReader contract over an extracted JSONL file.
 *
 * Reads LINE BY LINE with a bounded buffer. The extracted corpus is never held in
 * memory (DEC-036 constraint 6), so the ingestion pipeline stays inside the 128 MB
 * budget that NFR-014 still binds.
 *
 * No parquet dependency here, deliberately: everything downstream of the JSONL
 * boundary is plain Node.
 */
import { createReadStream, statSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export class JsonlCorpusReader {
  #path; #index = null; #total = 0;

  constructor({ path }) {
    if (!existsSync(path)) {
      throw new Error(`CORPUS_NOT_FOUND: no extracted corpus at ${path}. Run \`appmd corpus extract\` first.`);
    }
    this.#path = path;
  }

  id() { return `jsonl:${this.#path}`; }
  total() { return this.#index ? this.#index.length : this.#total; }
  get bytes() { return statSync(this.#path).size; }

  /** One pass to count rows. Holds a single line at a time, never the file. */
  async open() {
    let n = 0;
    for await (const _ of this.#lines()) n++;
    this.#total = n;
    return this;
  }

  async *#lines() {
    const rl = createInterface({ input: createReadStream(this.#path, { encoding: 'utf8' }),
                                crlfDelay: Infinity });
    for await (const line of rl) if (line.trim() !== '') yield line;
  }

  /**
   * Deterministic: the JSONL preserves extraction order, so the same range always
   * yields the same rows in the same sequence (NFR-001).
   */
  async readRange(offset, length) {
    const out = [];
    let i = 0;
    for await (const line of this.#lines()) {
      if (i >= offset + length) break;
      if (i >= offset) out.push(JSON.parse(line));
      i++;
    }
    return out;
  }

  /** Streaming iteration for the ladder: one row in memory at a time. */
  async *rows() {
    for await (const line of this.#lines()) yield JSON.parse(line);
  }
}
