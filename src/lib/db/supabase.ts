import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataStore, Row, SelectOptions, Where } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Query = any;

const PAGE = 1000;

export function applyWhere(q: Query, where?: Where): Query {
  if (!where) return q;
  for (const [col, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (cond === null) q = q.is(col, null);
    else if (Array.isArray(cond)) q = cond.length ? q.in(col, cond) : q.in(col, ["__never__"]);
    else if (typeof cond === "object") {
      const { op, value } = cond as { op: string; value: any };
      if (op === "ne") q = value === null ? q.not(col, "is", null) : q.or(`${col}.is.null,${col}.neq.${value}`);
      else if (op === "not_in") q = value.length ? q.not(col, "in", `(${value.map((v: any) => JSON.stringify(v)).join(",")})`) : q;
      else q = q[op](col, value);
    } else q = q.eq(col, typeof cond === "boolean" ? (cond ? 1 : 0) : cond);
  }
  return q;
}

function normalise(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "boolean" ? (v ? 1 : 0) : v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  }
  return out;
}

/**
 * Supabase (PostgREST) adapter. Tables are created by running db/migrations/*.sql
 * in the Supabase SQL editor (or scripts/supabase-push.ts with SUPABASE_DB_URL).
 */
export class SupabaseStore implements DataStore {
  readonly kind = "supabase" as const;
  readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string, client?: SupabaseClient) {
    this.client =
      client ?? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private check<T>(res: { data: T; error: { message: string } | null }, ctx: string): T {
    if (res.error) throw new Error(`Supabase ${ctx}: ${res.error.message}`);
    return res.data;
  }

  async migrate(): Promise<string[]> {
    // DDL cannot run through PostgREST. We verify the schema exists instead.
    const res = await this.client.from("schema_migrations").select("id");
    if (res.error)
      throw new Error(
        "Supabase schema missing. Paste db/supabase/all_migrations.sql into the Supabase SQL editor and run it once.",
      );
    return [];
  }

  async select<T = Row>(table: string, opts: SelectOptions = {}): Promise<T[]> {
    const cols = opts.columns?.length ? opts.columns.join(",") : "*";
    const want = opts.limit ?? Infinity;
    const out: T[] = [];
    let offset = opts.offset ?? 0;
    while (out.length < want) {
      const take = Math.min(PAGE, want - out.length);
      let q: Query = this.client.from(table).select(cols);
      q = applyWhere(q, opts.where);
      for (const [c, d] of opts.orderBy ?? []) q = q.order(c, { ascending: d !== "desc" });
      q = q.range(offset, offset + take - 1);
      const data = this.check(await q, `select ${table}`) as T[];
      out.push(...data);
      if (data.length < take) break;
      offset += take;
    }
    return out;
  }

  async first<T = Row>(table: string, opts: SelectOptions = {}): Promise<T | undefined> {
    return (await this.select<T>(table, { ...opts, limit: 1 }))[0];
  }

  async count(table: string, where?: Where): Promise<number> {
    let q: Query = this.client.from(table).select("*", { count: "exact", head: true });
    q = applyWhere(q, where);
    const res = await q;
    if (res.error) throw new Error(`Supabase count ${table}: ${res.error.message}`);
    return res.count ?? 0;
  }

  async insert(table: string, rows: Row | Row[]): Promise<void> {
    const arr = (Array.isArray(rows) ? rows : [rows]).map(normalise);
    for (let i = 0; i < arr.length; i += 500)
      this.check(await this.client.from(table).insert(arr.slice(i, i + 500)), `insert ${table}`);
  }

  async upsert(table: string, rows: Row | Row[], conflictKeys: string[]): Promise<void> {
    const arr = (Array.isArray(rows) ? rows : [rows]).map(normalise);
    for (let i = 0; i < arr.length; i += 500)
      this.check(
        await this.client.from(table).upsert(arr.slice(i, i + 500), { onConflict: conflictKeys.join(",") }),
        `upsert ${table}`,
      );
  }

  async update(table: string, where: Where, patch: Row): Promise<number> {
    let q: Query = this.client.from(table).update(normalise(patch), { count: "exact" });
    q = applyWhere(q, where);
    const res = await q;
    if (res.error) throw new Error(`Supabase update ${table}: ${res.error.message}`);
    return res.count ?? 0;
  }

  async delete(table: string, where: Where): Promise<number> {
    if (!Object.keys(where).length) throw new Error("Refusing to delete without a where clause");
    let q: Query = this.client.from(table).delete({ count: "exact" });
    q = applyWhere(q, where);
    const res = await q;
    if (res.error) throw new Error(`Supabase delete ${table}: ${res.error.message}`);
    return res.count ?? 0;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async close() {}
}
