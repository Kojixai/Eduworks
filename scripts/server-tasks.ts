/**
 * Maintenance tasks run on the server by deploy/deploy.sh (bundled to dist/server-tasks.cjs):
 *   migrate          apply db/migrations
 *   import           load content/inkworks into the database (idempotent)
 *   cleanup          production hygiene: create the admin from ADMIN_EMAIL/ADMIN_PASSWORD if both are set,
 *                    otherwise delete the default demo admin (admin@example.com). Also removes the public demo parent:
 *                    admins preview the parent and child views with the "view as" switcher and sample data instead.
 *   demo-activity    DEMO ONLY: give the demo parent three books and three weeks of practice so the dashboard has data
 *   remove-demo      delete the demo parent, its learners and all their data
 *   backup           consistent copy of the database to $BACKUP_DIR (default /var/backups/learnworks), keeps the newest 14
 *   generate-codes   --books a,b --count N [--kind title|copy]: make access codes. Only hashes are stored; the plain codes
 *                    are printed ONCE to the terminal (and to --out file if given). Needs CODE_PEPPER.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import fs from "node:fs";
import path from "node:path";
import { importInkworks, demoCodesAllowed } from "../src/practice/importer";
import { generateCode, formatCode } from "../src/practice/codes";
import { hashCode } from "../src/practice/hash";

const store = new SqliteStore(process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH);
const day = (offset: number) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

async function cleanup() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (email && pw) {
    const hash = await bcrypt.hash(pw, 10);
    const existing = await store.first<{ id: string }>("parents", { where: { email } });
    if (existing) await store.update("parents", { id: existing.id }, { is_admin: 1, password_hash: hash });
    else await store.insert("parents", { id: crypto.randomUUID(), name: "Admin", email, password_hash: hash, is_admin: 1, account_type: "parent", created_at: new Date().toISOString() });
    console.log(`admin account ready for ${email}`);
  }
  // security logs are kept 30 days (see the privacy notice)
  await store.delete("redeem_attempts", { created_at: { op: "lt", value: new Date(Date.now() - 30 * 864e5).toISOString() } });
  if (email !== "admin@example.com") {
    const n = await store.delete("parents", { email: "admin@example.com", is_admin: 1 });
    await store.delete("auth_sessions", { parent_id: "admin" });
    console.log(n ? "removed the default demo admin" : "no default demo admin present");
  }
  if (process.env.NODE_ENV === "production") await removeDemo();
}

async function demoActivity() {
  const parent = await store.first<{ id: string }>("parents", { where: { email: "demo@example.com" } });
  if (!parent) return console.log("no demo parent; nothing to do");
  const kids = await store.select<{ id: string; first_name: string }>("students", { where: { parent_id: parent.id } });
  const sam = kids.find((k) => k.first_name === "Sam");
  if (!sam) return console.log("no demo learner Sam");
  const exp = new Date(Date.now() + 150 * 864e5).toISOString();
  for (const b of ["y3maths", "y8maths", "ks3english"]) {
    if (!(await store.first("redemptions", { where: { parent_id: parent.id, book_id: b } })))
      await store.insert("redemptions", { id: crypto.randomUUID(), book_code_id: `code-${b}`, book_id: b, parent_id: parent.id, parent_name: "Demo Parent", email: "demo@example.com", order_hash: null, marketing_opt_in: 0, terms_accepted_at: new Date().toISOString(), consent_timestamp: null, expires_at: exp, created_at: new Date().toISOString() });
  }
  await store.delete("practice_attempts", { student_id: sam.id });
  await store.delete("practice_sessions", { student_id: sam.id });
  const plan: Array<[number, string, string, number]> = [
    [20, "y3maths", "y3maths-u01", 6], [19, "y3maths", "y3maths-u02", 7], [16, "y3maths", "y3maths-u01", 8], [15, "y3maths", "y3maths-u03", 5],
    [13, "y3maths", "y3maths-u02", 9], [12, "y3maths", "y3maths-u04", 7], [10, "y3maths", "y3maths-u01", 9], [9, "y3maths", "y3maths-u03", 6],
    [8, "ks3english", "ks3english-u01", 7], [6, "y3maths", "y3maths-u05", 8], [5, "y3maths", "y3maths-u03", 8], [4, "ks3english", "ks3english-u02", 9],
    [3, "y3maths", "y3maths-u06", 6], [2, "ks3english", "ks3english-u01", 8], [1, "y3maths", "y3maths-u04", 9], [0, "y3maths", "y3maths-u03", 7],
  ];
  for (const [ago, book, unit, score] of plan) {
    const id = crypto.randomUUID(), at = new Date(Date.now() - ago * 864e5 - 3600e3 * (ago % 5)).toISOString();
    await store.insert("practice_sessions", { id, student_id: sam.id, book_id: book, unit_id: unit, score, max_score: 10, correct_count: score, question_count: 10, day: day(ago), completed_at: at });
    await store.insert("practice_attempts", Array.from({ length: 10 }, (_, k) => ({ id: crypto.randomUUID(), session_id: id, student_id: sam.id, book_id: book, unit_id: unit, question_id: `${unit}-q${String(k + 1).padStart(2, "0")}`, is_retry: 0, correct: k < score ? 1 : 0, marks_awarded: k < score ? 1 : 0, marks_available: 1, response_json: null, created_at: at })));
  }
  console.log(`demo activity: ${plan.length} sessions for Sam`);
}

async function removeDemo() {
  const parent = await store.first<{ id: string }>("parents", { where: { email: "demo@example.com" } });
  if (!parent) return console.log("no demo parent");
  for (const k of await store.select<{ id: string }>("students", { where: { parent_id: parent.id } })) {
    const att = await store.select<{ id: string }>("attempts", { where: { student_id: k.id }, columns: ["id"] });
    if (att.length) await store.delete("results", { attempt_id: att.map((a) => a.id) });
    for (const t of ["attempts", "topic_progress", "practice_attempts", "practice_sessions"]) await store.delete(t, { student_id: k.id });
    await store.delete("students", { id: k.id });
  }
  for (const t of ["redemptions", "mailing_consent", "auth_sessions"]) await store.delete(t, { parent_id: parent.id });
  await store.delete("parents", { id: parent.id });
  console.log("demo parent and its data removed");
}

async function backup() {
  const dir = process.env.BACKUP_DIR ?? "/var/backups/learnworks";
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `eduworks-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  await store.db.backup(file); // consistent even while the site is running
  for (const old of fs.readdirSync(dir).filter((f) => f.startsWith("eduworks-")).sort().slice(0, -14)) fs.rmSync(path.join(dir, old));
  console.log(`backup written: ${file} (${(fs.statSync(file).size / 1e6).toFixed(0)} MB)`);
}

async function generate() {
  const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
  const pepper = process.env.CODE_PEPPER;
  if (!pepper) throw new Error("CODE_PEPPER is not set (source the server .env first)");
  const kind = arg("kind") === "copy" ? "copy" : "title";
  const count = Math.max(1, Math.min(100000, Number(arg("count") ?? 1)));
  const known = (await store.select<{ id: string }>("practice_books", { columns: ["id"] })).map((b) => b.id);
  const books = (arg("books") ?? known.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  for (const b of books) if (!known.includes(b)) throw new Error(`unknown book ${b}`);
  const lines: string[] = ["book,kind,code"];
  const now = new Date().toISOString();
  for (const b of books) for (let i = 0; i < count; i++) {
    const code = generateCode((n) => crypto.randomBytes(n));
    await store.insert("book_codes", { id: crypto.randomUUID(), book_id: b, code: null, code_hash: hashCode(code, pepper), kind, active: 1, is_demo: 0, created_at: now });
    lines.push(`${b},${kind},${formatCode(code)}`);
  }
  const out = arg("out");
  if (out) fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(lines.join("\n"));
  console.error(`\n${lines.length - 1} code(s) made. Plain codes are shown only now; the database holds hashes.`);
}

(async () => {
  const task = process.argv[2];
  console.log("migrations applied:", (await store.migrate()).join(", ") || "none");
  if (task === "import") console.log(await importInkworks(store, { demoCodesActive: demoCodesAllowed() }));
  else if (task === "cleanup") await cleanup();
  else if (task === "demo-activity") await demoActivity();
  else if (task === "remove-demo") await removeDemo();
  else if (task === "backup") await backup();
  else if (task === "generate-codes") await generate();
  else if (task !== "migrate") { console.error("usage: server-tasks <migrate|import|cleanup|demo-activity|remove-demo|backup|generate-codes>"); process.exit(2); }
  await store.close();
})();
