/**
 * A D1Database implementing Cloudflare's documented interface over node:sqlite.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the driver adapts D1's *call shape*
 * correctly — `.bind()` binding, `.first()` returning one row or null, `.all()` resolving
 * to `{ results }`, everything asynchronous. Because it is backed by real SQLite, the
 * entire existing contract suite runs against it unchanged.
 *
 * It does NOT prove D1's behaviour: no network, no row limits, no query timeouts, no
 * eventual consistency, no size ceiling. Those are only knowable against a real binding,
 * and this file must never be mistaken for that evidence (`RSK-011`).
 */
import { DatabaseSync } from 'node:sqlite';

class FakeStatement {
  #stmt; #params = [];
  constructor(stmt) { this.#stmt = stmt; }
  bind(...params) { this.#params = params; return this; }
  async first(column) {
    const row = this.#stmt.get(...this.#params) ?? null;
    return column && row ? row[column] : row;
  }
  async all() { return { results: this.#stmt.all(...this.#params), success: true, meta: {} }; }
  async run() { const r = this.#stmt.run(...this.#params); return { success: true, meta: r }; }
}

export class FakeD1Database {
  #db;
  constructor() {
    this.#db = new DatabaseSync(':memory:');
    this.#db.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql) { return new FakeStatement(this.#db.prepare(sql)); }
  /**
   * ENFORCES D1's line rule rather than tolerating a violation of it. A fake that quietly
   * accepts multi-line DDL would let a migration pass here and fail on the real binding,
   * which is the one failure mode a fake exists to prevent.
   */
  async exec(sql) {
    const lines = sql.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.endsWith(';')) {
        throw new Error(`D1 exec is line-oriented: each statement must be on one line and end with ';'. Got: ${line.slice(0, 60)}…`);
      }
      this.#db.exec(line);
    }
    return { count: lines.length };
  }
  async batch(statements) { return Promise.all(statements.map((s) => s.run())); }
  close() { this.#db.close(); }
}
