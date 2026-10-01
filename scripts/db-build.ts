/**
 * Builds data/db/eduworks.sqlite from the committed JSONL export (fresh clone, CI, Vercel build).
 * Skips the build when the database already has content, unless --force is passed.
 * Then seeds the demo parent, child, books and codes (idempotent).
 */
import fs from "node:fs";
import path from "node:path";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import { CONTENT_TABLES, pkFor } from "../src/lib/db/store";
import { seedDemo } from "./seed-demo";

const BUILT_AT = new Date().toISOString();
const VOLATILE: Record<string, string[]> = { sources: ["created_at", "updated_at"], ingest_checkpoints: ["updated_at"], coverage_matrix: ["computed_at"], dataset_stats: ["computed_at"] };

export async function buildDb(dbPath = DEFAULT_SQLITE_PATH, force = false) {
  const manifestPath = path.join(process.cwd(), "data", "jsonl", "manifest.json");
  const store = new SqliteStore(dbPath);
  await store.migrate();
  const hasContent = (store.db.prepare("SELECT COUNT(*) n FROM curriculum_statements").get() as { n: number }).n > 0;
  if (hasContent && !force) {
    console.log("Database already populated; use --force to rebuild from JSONL.");
  } else if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { tables: Record<string, { parts: Array<{ file: string }> }> };
    for (const table of CONTENT_TABLES) {
      const e = manifest.tables[table];
      if (!e) continue;
      store.db.exec(`DELETE FROM "${table}"`);
      let n = 0;
      for (const p of e.parts) {
        const lines = fs.readFileSync(path.join(process.cwd(), p.file), "utf8").split("\n").filter(Boolean);
        const rows = lines.map((l) => JSON.parse(l));
        // the export strips volatile timestamps (see export-jsonl.ts); the columns are NOT NULL, so restore them
        for (const r of rows) for (const c of VOLATILE[table] ?? []) r[c] ??= BUILT_AT;
        for (let i = 0; i < rows.length; i += 2000) await store.upsert(table, rows.slice(i, i + 2000), pkFor(table));
        n += rows.length;
      }
      console.log(`${table.padEnd(28)} ${n}`);
    }
  } else {
    console.log("No JSONL export found; run `npm run ingest` first.");
  }
  await seedDemo(store);
  await store.close();
}

if (require.main === module) buildDb(DEFAULT_SQLITE_PATH, process.argv.includes("--force")).catch((e) => {
  console.error(e);
  process.exit(1);
});
