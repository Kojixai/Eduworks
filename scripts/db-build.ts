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
import { loadContentFromJsonl } from "../src/lib/db/jsonl-import";
import { demoCodesAllowed, importInkworks } from "../src/practice/importer";

const BUILT_AT = new Date().toISOString();
const VOLATILE: Record<string, string[]> = { sources: ["created_at", "updated_at"], ingest_checkpoints: ["updated_at"], coverage_matrix: ["computed_at"], dataset_stats: ["computed_at"] };

export async function buildDb(dbPath = DEFAULT_SQLITE_PATH, force = false) {
  const store = new SqliteStore(dbPath);
  await store.migrate();
  const hasContent = (store.db.prepare("SELECT COUNT(*) n FROM curriculum_statements").get() as { n: number }).n > 0;
  if (hasContent && !force) {
    console.log("Database already populated; use --force to rebuild from JSONL.");
  } else {
    await loadContentFromJsonl(store, store.db);
  }
  const ink = await importInkworks(store, { demoCodesActive: demoCodesAllowed() });
  console.log(`inkworks practice banks: ${ink.books} imported (${ink.units} units, ${ink.questions} questions), ${ink.skipped.length} unchanged`);
  await seedDemo(store);
  await store.close();
}

if (require.main === module) buildDb(DEFAULT_SQLITE_PATH, process.argv.includes("--force")).catch((e) => {
  console.error(e);
  process.exit(1);
});
