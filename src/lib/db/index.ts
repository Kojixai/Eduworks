import path from "node:path";
import type { DataStore } from "./store";
import { SqliteStore } from "./sqlite";
import { SupabaseStore } from "./supabase";

export const DEFAULT_SQLITE_PATH = path.join(process.cwd(), "data", "db", "eduworks.sqlite");

/** Supabase is used automatically when SUPABASE_URL and SUPABASE_SERVICE_KEY are both set. */
export function createStore(opts: { forceSqlite?: boolean; sqlitePath?: string } = {}): DataStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!opts.forceSqlite && url && key) return new SupabaseStore(url, key);
  return new SqliteStore(opts.sqlitePath ?? process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH);
}

const g = globalThis as unknown as { __eduStore?: Promise<DataStore> };

/** Shared store for the web app (one per server process). */
export function getStore(): Promise<DataStore> {
  if (!g.__eduStore) {
    g.__eduStore = (async () => {
      const s = createStore();
      await s.migrate();
      return s;
    })();
  }
  return g.__eduStore;
}

export type { DataStore } from "./store";
