/**
 * The SQL driver seam. CR-011, increment 14.
 *
 * WHY A SEAM RATHER THAN A SECOND STORE. D1 speaks SQLite's dialect, so every query in
 * `canonical-store.js` is already valid against it — what differs is the *call shape*:
 * `node:sqlite` returns rows directly, D1 returns Promises and wraps `all()` results in
 * `{ results }`. Copying 488 lines of store logic to change that would create two
 * implementations of the same schema that can silently disagree, which is precisely the
 * class of drift `DEF-009` was.
 *
 * So the store keeps the SQL and the semantics; the driver owns the call shape. Adding
 * PostgreSQL later means one more driver, not one more store.
 *
 * Both drivers present the SAME async interface:
 *   prepare(sql) -> { get(...params), all(...params), run(...params) }
 *   exec(sql)
 *
 * `node:sqlite` is synchronous underneath and that is fine — the driver's contract is
 * async, so the store cannot depend on the difference. That is the lesson DEF-009 cost.
 */

/** node:sqlite, used for local development, tests and the batch runtime. */
export class NodeSqliteDriver {
  #db;
  constructor(db) { this.#db = db; }

  prepare(sql) {
    const stmt = this.#db.prepare(sql);
    return {
      async get(...params) { return stmt.get(...params) ?? null; },
      async all(...params) { return stmt.all(...params); },
      async run(...params) { return stmt.run(...params); },
    };
  }

  async exec(sql) { return this.#db.exec(sql); }
  close() { this.#db.close(); }
  get raw() { return this.#db; }
}

/**
 * Cloudflare D1.
 *
 * Two differences from node:sqlite that the store must never see:
 *   1 parameters are bound with .bind(...) rather than passed to get/all/run
 *   2 .all() resolves to { results, meta }, not an array
 *
 * D1's `exec()` accepts multiple statements but is documented as line-sensitive and
 * takes no parameters, so migrations go through it and nothing else does.
 */
export class D1Driver {
  #db;
  constructor(db) {
    if (!db || typeof db.prepare !== 'function') {
      throw new TypeError('D1Driver requires a D1Database binding (env.DB)');
    }
    this.#db = db;
  }

  prepare(sql) {
    const db = this.#db;
    const bind = (params) => (params.length ? db.prepare(sql).bind(...params) : db.prepare(sql));
    return {
      async get(...params) { return (await bind(params).first()) ?? null; },
      async all(...params) { return (await bind(params).all()).results ?? []; },
      async run(...params) { return bind(params).run(); },
    };
  }

  /**
   * D1's `exec()` is line-oriented: each statement must sit on ONE line. Our migrations
   * are multi-line DDL with trailing `-- REQ` comments, so they must be rewritten before
   * they are sent.
   *
   * The comment stripping is NOT cosmetic. Flattening first and stripping second turns
   * `partition_key TEXT NOT NULL, -- NFR-033` into a line where the comment swallows the
   * remainder of the table definition, and D1 reports only "incomplete input". That bug
   * was written, hit, and is the reason this method is nine lines instead of one.
   *
   * Safe here because these statements are static DDL we author. It would NOT be safe on
   * source-derived SQL — `DEF-004` was a repository literally named `study--AI_ML`.
   */
  async exec(sql) {
    const statements = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, '').trim())   // strip comments BEFORE joining
      .filter(Boolean)
      .join(' ')
      .split(';')
      .map((st) => st.trim())
      .filter(Boolean);

    for (const statement of statements) await this.#db.exec(`${statement};`);
    return { count: statements.length };
  }

  /** D1 bindings are managed by the runtime; there is nothing to close. */
  close() {}
  get raw() { return this.#db; }
}
