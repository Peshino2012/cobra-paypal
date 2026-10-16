// Base D1 de mentira sobre node:sqlite, con la misma interfaz que usa la app
// (prepare/bind/first/all/run y batch), y las migraciones aplicadas.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export function crearD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const preparar = (sql) => {
    let params = [];
    const st = {
      bind(...p) {
        params = p.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x));
        return st;
      },
      async first() {
        return db.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...params) };
      },
      async run() {
        const r = db.prepare(sql).run(...params);
        return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } };
      },
    };
    return st;
  };
  return {
    prepare: preparar,
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    sqlite: db,
  };
}
