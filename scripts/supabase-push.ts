/**
 * Pushes the local SQLite data to Supabase (run after pasting db/supabase/all_migrations.sql
 * into the Supabase SQL editor once). Resumable: progress is stored in data/checkpoints/supabase_push.json.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run supabase:push            # content tables
 *   ... npm run supabase:push -- --include-platform                           # also accounts/redemptions/progress
 *   ... npm run supabase:push -- --restart                                    # ignore saved progress
 *
 * Also regenerates db/supabase/all_migrations.sql (the combined, RLS-enabled schema).
 */
import fs from "node:fs";
import path from "node:path";
import { SqliteStore } from "../src/lib/db/sqlite";
import { SupabaseStore } from "../src/lib/db/supabase";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import { CONTENT_TABLES, TABLES_IN_DEPENDENCY_ORDER, pkFor } from "../src/lib/db/store";

const CKPT = path.join(process.cwd(), "data", "checkpoints", "supabase_push.json");

export function buildCombinedMigrations(): string {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let out = "-- Eduworks schema for Supabase/PostgreSQL. Paste into the Supabase SQL editor and run once.\n-- Generated from db/migrations by scripts/supabase-push.ts. Safe to re-run.\n\n";
  for (const f of files) out += `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8")}\n`;
  out += "\n-- Record applied migrations\n";
  for (const f of files) out += `INSERT INTO schema_migrations (id, applied_at) VALUES ('${f}', now()::text) ON CONFLICT (id) DO NOTHING;\n`;
  out += "\n-- Row level security on: only the server (service key) can read or write. The browser never talks to Supabase directly.\n";
  for (const t of ["schema_migrations", ...TABLES_IN_DEPENDENCY_ORDER]) out += `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;\n`;
  return out;
}

async function main() {
  const outFile = path.join(process.cwd(), "db", "supabase", "all_migrations.sql");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buildCombinedMigrations());
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_KEY not set: nothing pushed.");
    return;
  }
  const includePlatform = process.argv.includes("--include-platform");
  const ck: Record<string, number> = !process.argv.includes("--restart") && fs.existsSync(CKPT) ? JSON.parse(fs.readFileSync(CKPT, "utf8")) : {};
  const src = new SqliteStore(DEFAULT_SQLITE_PATH);
  const dst = new SupabaseStore(url, key);
  await dst.migrate(); // verifies schema exists
  const tables = includePlatform ? TABLES_IN_DEPENDENCY_ORDER : CONTENT_TABLES;
  for (const t of tables) {
    const total = await src.count(t);
    let offset = ck[t] ?? 0;
    while (offset < total) {
      const rows = await src.select(t, { limit: 1000, offset, orderBy: pkFor(t).map((c) => [c, "asc"] as [string, "asc"]) });
      await dst.upsert(t, rows, pkFor(t));
      offset += rows.length;
      ck[t] = offset;
      fs.writeFileSync(CKPT, JSON.stringify(ck, null, 1));
      process.stdout.write(`\r${t.padEnd(28)} ${offset}/${total}`);
    }
    process.stdout.write(`\r${t.padEnd(28)} ${total}/${total} done\n`);
  }
  await src.close();
}

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
