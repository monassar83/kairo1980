/* A D1-shaped database backed by node:sqlite.
   D1 is SQLite, so the store can be tested against the real schema and the
   real statements — including the conditional UPDATE that stops a double
   capture and the UNIQUE index that stops a replayed webhook. A mock would
   have proved only that the mock agrees with itself. */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../../migrations/0001_payments.sql', import.meta.url));

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args);
  }

  #prepared() {
    return this.db.prepare(this.sql);
  }

  async run() {
    const result = this.#prepared().run(...this.args);
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async first() {
    const row = this.#prepared().get(...this.args);
    return row === undefined ? null : row;
  }

  async all() {
    return { results: this.#prepared().all(...this.args), success: true };
  }
}

export function freshDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(SCHEMA, 'utf8'));
  return {
    prepare: (sql) => new Statement(db, sql),
    // Not part of D1's surface — the tests use it to look at raw rows.
    _raw: db
  };
}
