/**
 * Exports every content table from SQLite to data/jsonl/<table>/part-NNNN.jsonl (each part < 20 MB)
 * plus data/jsonl/manifest.json (row counts + sha256 per part). Personal-data tables are never exported.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import { CONTENT_TABLES } from "../src/lib/db/store";

const OUT = path.join(process.cwd(), "data", "jsonl");
const MAX_PART_BYTES = 20 * 1024 * 1024;
// Operational tables that change on every run; excluded to keep diffs meaningful.
const SKIP = new Set(["ingest_logs", "ingest_runs"]);
// Timestamps that change on every run without the data changing.
const VOLATILE: Record<string, string[]> = {
  sources: ["updated_at", "created_at"],
  ingest_checkpoints: ["updated_at"],
  coverage_matrix: ["computed_at"],
  dataset_stats: ["computed_at"],
};

export function exportJsonl(dbPath = DEFAULT_SQLITE_PATH) {
  const store = new SqliteStore(dbPath);
  const manifest: Record<string, { rows: number; parts: Array<{ file: string; rows: number; bytes: number; sha256: string }> }> = {};
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const table of CONTENT_TABLES) {
    if (SKIP.has(table)) continue;
    const dir = path.join(OUT, table);
    fs.mkdirSync(dir, { recursive: true });
    const stmt = store.db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`);
    let part = 0;
    let buf: string[] = [];
    let bytes = 0;
    let rows = 0;
    const entry = { rows: 0, parts: [] as Array<{ file: string; rows: number; bytes: number; sha256: string }> };
    const flush = () => {
      if (!buf.length) return;
      part++;
      const file = path.join(dir, `part-${String(part).padStart(4, "0")}.jsonl`);
      const body = buf.join("");
      fs.writeFileSync(file, body);
      entry.parts.push({ file: path.relative(process.cwd(), file), rows: buf.length, bytes: Buffer.byteLength(body), sha256: crypto.createHash("sha256").update(body).digest("hex") });
      buf = [];
      bytes = 0;
    };
    for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
      // nulls are omitted (the builder restores them as NULL); keeps the export small
      const compact: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) if (v !== null && !VOLATILE[table]?.includes(k)) compact[k] = v;
      const line = JSON.stringify(compact) + "\n";
      const len = Buffer.byteLength(line);
      if (bytes + len > MAX_PART_BYTES) flush();
      buf.push(line);
      bytes += len;
      rows++;
    }
    flush();
    entry.rows = rows;
    manifest[table] = entry;
    if (!rows) fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ exported_at: new Date().toISOString(), tables: manifest }, null, 1));
  store.close();
  return manifest;
}

if (require.main === module) {
  const m = exportJsonl();
  for (const [t, e] of Object.entries(m)) if (e.rows) console.log(`${t.padEnd(28)} ${String(e.rows).padStart(8)} rows  ${e.parts.length} part(s)`);
}
