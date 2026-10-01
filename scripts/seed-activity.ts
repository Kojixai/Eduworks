/**
 * DEV ONLY: fills the demo child (Sam) with three weeks of realistic Inkworks practice so the dashboard has something
 * to show. Never run against the live database. Usage: SQLITE_PATH=... npx tsx scripts/seed-activity.ts
 */
import crypto from "node:crypto";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";

const store = new SqliteStore(process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH);
const day = (offset: number) => { const d = new Date(Date.now() - offset * 864e5); return d.toISOString().slice(0, 10); };
(async () => {
  await store.migrate();
  const sid = "demo-child-sam";
  await store.delete("practice_attempts", { student_id: sid });
  await store.delete("practice_sessions", { student_id: sid });
  for (const b of ["y3maths", "y8maths", "ks3english"]) {
    const exp = new Date(Date.now() + 150 * 864e5).toISOString();
    if (!(await store.first("redemptions", { where: { parent_id: "demo-parent", book_id: b } })))
      await store.insert("redemptions", { id: crypto.randomUUID(), book_code_id: `code-${b}`, book_id: b, parent_id: "demo-parent", parent_name: "Demo Parent", email: "demo@example.com", order_hash: null, marketing_opt_in: 0, terms_accepted_at: new Date().toISOString(), consent_timestamp: null, expires_at: exp, created_at: new Date().toISOString() });
  }
  const plan: Array<[number, string, string, number]> = [ // [days ago, book, unit, score of 10]
    [20, "y3maths", "y3maths-u01", 6], [19, "y3maths", "y3maths-u02", 7], [16, "y3maths", "y3maths-u01", 8], [15, "y3maths", "y3maths-u03", 5],
    [13, "y3maths", "y3maths-u02", 9], [12, "y3maths", "y3maths-u04", 7], [10, "y3maths", "y3maths-u01", 9], [9, "y3maths", "y3maths-u03", 6],
    [8, "ks3english", "ks3english-u01", 7], [6, "y3maths", "y3maths-u05", 8], [5, "y3maths", "y3maths-u03", 8], [4, "ks3english", "ks3english-u02", 9],
    [3, "y3maths", "y3maths-u06", 6], [2, "ks3english", "ks3english-u01", 8], [1, "y3maths", "y3maths-u04", 9], [0, "y3maths", "y3maths-u03", 7],
  ];
  for (const [ago, book, unit, score] of plan) {
    const id = crypto.randomUUID(); const at = new Date(Date.now() - ago * 864e5 - 3600e3 * (ago % 5)).toISOString();
    await store.insert("practice_sessions", { id, student_id: sid, book_id: book, unit_id: unit, score, max_score: 10, correct_count: score, question_count: 10, day: day(ago), completed_at: at });
    await store.insert("practice_attempts", Array.from({ length: 10 }, (_, k) => ({ id: crypto.randomUUID(), session_id: id, student_id: sid, book_id: book, unit_id: unit, question_id: `${unit}-q${String(k + 1).padStart(2, "0")}`, is_retry: 0, correct: k < score ? 1 : 0, marks_awarded: k < score ? 1 : 0, marks_available: 1, response_json: null, created_at: at })));
  }
  console.log(`seeded ${plan.length} sessions for ${sid}`);
  await store.close();
})();
