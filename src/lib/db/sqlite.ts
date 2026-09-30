import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Condition, DataStore, Row, SelectOptions, Where } from "./store";

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

function toParam(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export function buildWhere(where: Where | undefined): { sql: string; params: unknown[] } {
  if (!where) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [col, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const c = ident(col);
    if (cond === null) parts.push(`${c} IS NULL`);
    else if (Array.isArray(cond)) {
      if (cond.length === 0) parts.push("0 = 1");
      else {
        parts.push(`${c} IN (${cond.map(() => "?").join(",")})`);
        params.push(...cond.map(toParam));
      }
    } else if (typeof cond === "object") {
      const op = (cond as { op: string }).op;
      const value = (cond as { value: unknown }).value;
      if (op === "not_in") {
        const arr = value as unknown[];
        if (arr.length) {
          parts.push(`${c} NOT IN (${arr.map(() => "?").join(",")})`);
          params.push(...arr.map(toParam));
        }
      } else if (op === "ne") {
        if (value === null) parts.push(`${c} IS NOT NULL`);
        else {
          parts.push(`(${c} IS NULL OR ${c} <> ?)`);
          params.push(toParam(value));
        }
      } else {
        const sqlOp = { gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "LIKE" }[op];
        if (!sqlOp) throw new Error(`Unknown op ${op}`);
        parts.push(`${c} ${sqlOp} ?`);
        params.push(toParam(value));
      }
    } else {
      parts.push(`${c} = ?`);
      params.push(toParam(cond as Condition));
    }
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

export class SqliteStore implements DataStore {
  readonly kind = "sqlite" as const;
  readonly db: Database.Database;
  private migrationsDir: string;

  constructor(file: string, migrationsDir = path.join(process.cwd(), "db", "migrations")) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = OFF"); // ingest order is controlled; FKs are validated in reports
    this.migrationsDir = migrationsDir;
  }

  async migrate(): Promise<string[]> {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const done = new Set(
      (this.db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id),
    );
    const applied: string[] = [];
    for (const f of fs.readdirSync(this.migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(this.migrationsDir, f), "utf8");
      this.db.exec(sql);
      this.db
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(f, new Date().toISOString());
      applied.push(f);
    }
    return applied;
  }

  async select<T = Row>(table: string, opts: SelectOptions = {}): Promise<T[]> {
    const cols = opts.columns?.length ? opts.columns.map(ident).join(", ") : "*";
    const w = buildWhere(opts.where);
    let sql = `SELECT ${cols} FROM ${ident(table)}${w.sql}`;
    if (opts.orderBy?.length)
      sql += ` ORDER BY ${opts.orderBy.map(([c, d]) => `${ident(c)} ${d === "desc" ? "DESC" : "ASC"}`).join(", ")}`;
    if (opts.limit !== undefined) sql += ` LIMIT ${Math.floor(opts.limit)}`;
    if (opts.offset !== undefined) sql += `${opts.limit === undefined ? " LIMIT -1" : ""} OFFSET ${Math.floor(opts.offset)}`;
    return this.db.prepare(sql).all(...(w.params as never[])) as T[];
  }

  async first<T = Row>(table: string, opts: SelectOptions = {}): Promise<T | undefined> {
    return (await this.select<T>(table, { ...opts, limit: 1 }))[0];
  }

  async count(table: string, where?: Where): Promise<number> {
    const w = buildWhere(where);
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM ${ident(table)}${w.sql}`).get(...(w.params as never[])) as {
      n: number;
    };
    return r.n;
  }

  private stmtCache = new Map<string, Database.Statement>();
  private prep(sql: string) {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  private writeRows(table: string, rows: Row[], conflictKeys: string[] | null) {
    if (!rows.length) return;
    const run = this.db.transaction((batch: Row[]) => {
      for (const row of batch) {
        const cols = Object.keys(row);
        let sql = `INSERT INTO ${ident(table)} (${cols.map(ident).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
        if (conflictKeys) {
          const updates = cols.filter((c) => !conflictKeys.includes(c));
          sql += ` ON CONFLICT (${conflictKeys.map(ident).join(", ")}) DO ${
            updates.length ? `UPDATE SET ${updates.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}` : "NOTHING"
          }`;
        }
        this.prep(sql).run(...(cols.map((c) => toParam(row[c])) as never[]));
      }
    });
    run(rows);
  }

  async insert(table: string, rows: Row | Row[]): Promise<void> {
    this.writeRows(table, Array.isArray(rows) ? rows : [rows], null);
  }

  async upsert(table: string, rows: Row | Row[], conflictKeys: string[]): Promise<void> {
    this.writeRows(table, Array.isArray(rows) ? rows : [rows], conflictKeys);
  }

  async update(table: string, where: Where, patch: Row): Promise<number> {
    const cols = Object.keys(patch);
    if (!cols.length) return 0;
    const w = buildWhere(where);
    const sql = `UPDATE ${ident(table)} SET ${cols.map((c) => `${ident(c)} = ?`).join(", ")}${w.sql}`;
    return this.db.prepare(sql).run(...([...cols.map((c) => toParam(patch[c])), ...w.params] as never[])).changes;
  }

  async delete(table: string, where: Where): Promise<number> {
    const w = buildWhere(where);
    if (!w.sql) throw new Error("Refusing to delete without a where clause");
    return this.db.prepare(`DELETE FROM ${ident(table)}${w.sql}`).run(...(w.params as never[])).changes;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const r = await fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** SQLite-only escape hatch for offline analytics (ingest, reports). Never used by the web app. */
  raw<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  async close() {
    this.db.close();
  }
}
