/**
 * Loads the committed content export (data/jsonl) into a SQLite database. Only CONTENT_TABLES are touched: accounts,
 * progress and book access are never read or written. Each table is replaced inside one transaction, so a visitor never
 * sees a half-loaded table.
 */
import fs from "node:fs";
import path from "node:path";
import type { DataStore } from "./store";
import { CONTENT_TABLES, pkFor } from "./store";

// The export strips volatile timestamps (see scripts/export-jsonl.ts); these columns are NOT NULL, so restore them.
const BUILT_AT = () => new Date().toISOString();
const VOLATILE: Record<string, string[]> = { sources: ["created_at", "updated_at"], ingest_checkpoints: ["updated_at"], coverage_matrix: ["computed_at"], dataset_stats: ["computed_at"] };

export async function loadContentFromJsonl(store: DataStore, raw: { exec(sql: string): unknown }, root = process.cwd(), log: (s: string) => void = console.log): Promise<boolean> {
  const manifestPath = path.join(root, "data", "jsonl", "manifest.json");
  if (!fs.existsSync(manifestPath)) { log("No JSONL export found; run `npm run ingest` first."); return false; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { tables: Record<string, { parts: Array<{ file: string }> }> };
  const now = BUILT_AT();
  for (const table of CONTENT_TABLES) {
    const e = manifest.tables[table];
    if (!e) continue;
    let n = 0;
    await store.transaction(async () => {
      raw.exec(`DELETE FROM "${table}"`);
      for (const p of e.parts) {
        const rows = fs.readFileSync(path.join(root, p.file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
        for (const r of rows) for (const c of VOLATILE[table] ?? []) r[c] ??= now;
        for (let i = 0; i < rows.length; i += 2000) await store.upsert(table, rows.slice(i, i + 2000), pkFor(table));
        n += rows.length;
      }
    });
    log(`${table.padEnd(28)} ${n}`);
  }
  return true;
}
