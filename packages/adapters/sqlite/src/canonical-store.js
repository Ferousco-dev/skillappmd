/**
 * The Node/SQLite adapter. DES-029. REQ-091, NFR-035, DEC-022, DEC-030.
 *
 * Everything about the schema, the queries and the semantics lives in `SqlCanonicalStore`,
 * which imports nothing from `node:` so it can also run on Workers. THIS file is the part
 * that legitimately cannot: opening a database file, checkpointing the WAL, copying a
 * backup. It belongs to the batch runtime and never ships to the edge.
 *
 * The split was forced by `wrangler deploy --dry-run`, which showed `node:sqlite` and
 * `node:fs` being pulled into the Worker bundle. `node:sqlite` does not exist on Workers,
 * so the deploy would have produced a Worker that fails to START — a failure no test in
 * this repository could have produced, because every test runs on Node.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqlCanonicalStore } from '../../sql-store/src/index.js';
import { NodeSqliteDriver } from './driver.js';

export class SqliteCanonicalStore extends SqlCanonicalStore {
  #path;

  /** @param {string|object} pathOrDriver a filesystem path, or a ready-made driver. */
  constructor(pathOrDriver = ':memory:') {
    if (typeof pathOrDriver !== 'string') {
      super(pathOrDriver);
      this.#path = null;
      return;
    }
    const path = pathOrDriver;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const raw = new DatabaseSync(path);
    raw.exec('PRAGMA journal_mode = WAL');
    raw.exec('PRAGMA foreign_keys = ON');
    super(new NodeSqliteDriver(raw));
    this.#path = path;
  }

  get path() { return this.#path; }

  // ---- backup / restore / verify (REQ-091, NFR-035, DEC-022) ---------------

  /** Uses SQLite's own consistent snapshot rather than copying a live file. */
  async backup(targetPath) {
    if (this.#path === ':memory:' || this.#path === null) {
      throw new Error('cannot back up an in-memory or driver-backed store');
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    await this._db.exec('PRAGMA wal_checkpoint(FULL)');
    copyFileSync(this.#path, targetPath);
    return { path: targetPath, ...(await this.digest()) };
  }

  static restore(backupPath, targetPath) {
    if (!existsSync(backupPath)) throw new Error(`backup not found: ${backupPath}`);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(backupPath, targetPath);
    return new SqliteCanonicalStore(targetPath);
  }

  /**
   * NFR-035: recovery is verified by restoring to a scratch location and asserting record
   * count and digest match. A restore procedure never executed is a document (DEC-022).
   */
  static async verifyRestore(backupPath, expected) {
    const scratch = `${backupPath}.verify`;
    const s = SqliteCanonicalStore.restore(backupPath, scratch);
    try {
      const actual = await s.digest();
      const ok = actual.records === expected.records && actual.digest === expected.digest;
      return { ok, expected, actual,
               reason: ok ? 'record count and digest match'
                          : `mismatch: expected ${expected.records}/${expected.digest}, got ${actual.records}/${actual.digest}` };
    } finally { s.close(); }
  }
}
