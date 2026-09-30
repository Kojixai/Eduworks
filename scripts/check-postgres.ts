/** Proves the migrations run unchanged on real PostgreSQL (PGlite = Postgres compiled to WASM). */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const db = new PGlite();
  const dir = path.join(process.cwd(), "db", "migrations");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    console.log("ok", f);
  }
  const combined = fs.readFileSync(path.join(process.cwd(), "db", "supabase", "all_migrations.sql"), "utf8");
  const db2 = new PGlite();
  await db2.exec(combined.replace(/ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/g, (m) => m)); // RLS is valid Postgres too
  const t = await db2.query<{ n: number }>("select count(*)::int n from information_schema.tables where table_schema='public'");
  console.log("combined file ok, tables:", t.rows[0].n);
  // round-trip a few representative rows
  await db2.exec(`insert into subjects (id,name,sort) values ('mathematics','Maths',1);
    insert into curriculum_statements (id,subject_id,level,text,framework) values ('s1','mathematics','statement','Count to 100','nc2014');
    insert into curriculum_statements (id,subject_id,level,text,framework) values ('s1','mathematics','statement','Count to 100!','nc2014') on conflict (id) do update set text = excluded.text;`);
  console.log((await db2.query("select text from curriculum_statements")).rows);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
