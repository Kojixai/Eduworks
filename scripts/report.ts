/**
 * Final status report: reports/final-report.html (single self-contained light HTML file).
 * Generated from the database so it can be re-run after every harvest: `npm run report`.
 */
import fs from "node:fs";
import path from "node:path";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import { card, esc, fmtN, heat, page, pill, raw, stats, table } from "./html";

type R = Record<string, unknown>;

export function buildReport(dbPath = DEFAULT_SQLITE_PATH) {
  const db = new SqliteStore(dbPath);
  const q = <T = R>(sql: string, ...p: unknown[]) => db.raw<T>(sql, ...p);
  const one = (sql: string, ...p: unknown[]) => Number(Object.values(q(sql, ...p)[0] ?? { n: 0 })[0]);
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");

  // ---- per-source harvest counts ----
  const tables = ["curriculum_statements", "units", "lessons", "content_blocks", "questions", "papers", "phonics_words", "assessment_rules", "assets", "raw_files"];
  const sources = q<R>("select id, name, access_status, access_notes, licence_id from sources order by id");
  const counts = new Map<string, Record<string, number>>();
  for (const t of tables) for (const r of q<R>(`select source_id s, count(*) n from ${t} group by 1`)) (counts.get(String(r.s)) ?? counts.set(String(r.s), {}).get(String(r.s))!)[t] = Number(r.n);
  const lastRun = new Map(q<R>("select source_id, status, error, stats_json from ingest_runs r where started_at=(select max(started_at) from ingest_runs x where x.source_id=r.source_id)").map((r) => [String(r.source_id), r]));
  const harvestRows = sources.map((s) => {
    const c = counts.get(String(s.id)) ?? {};
    const run = lastRun.get(String(s.id));
    const what = Object.entries(c).filter(([t]) => t !== "raw_files").map(([t, n]) => `${t.replace(/_/g, " ")}: ${fmtN(n)}`).join("<br>") || "—";
    const st = String(run?.status ?? (s.access_status === "blocked" ? "blocked" : "not run"));
    const access = s.id === "eduworks_original" ? "local" : String(s.access_status);
    return [raw(`<b>${esc(s.name)}</b><br><span class="small muted">${esc(s.id)}</span>`), pill(access, access === "reachable" || access === "local" ? "ok" : "warn"), pill(st, st === "ok" ? "ok" : st === "blocked" ? "warn" : "bad"), raw(`<span class="small">${what}</span>`), c.raw_files ?? 0];
  });

  // ---- failures ----
  const problems = q<R>("select source_id, level, code, message from ingest_logs where level in ('warn','error') and created_at > (select datetime(max(started_at), '-1 day') from ingest_runs) group by source_id, code order by level desc, source_id");

  // ---- coverage ----
  const cov = q<R>("select key_stage_id ks, subject_id s, sum(statement_count) st, sum(statements_with_lessons) wl, sum(statements_with_questions) wq, sum(lesson_count) l, sum(question_count) qn, sum(public_question_count) pq, sum(gap_count) g from coverage_matrix group by 1,2 order by 1,2");
  const pct = (a: unknown, b: unknown) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);

  // ---- attribution ----
  const attr = q<R>(`select attribution_text a, licence_id l, source_id s, sum(n) n, sum(tp) tp from (
      ${["curriculum_statements", "units", "lessons", "content_blocks", "questions", "papers", "phonics_words"].map((t) => `select attribution_text, licence_id, source_id, count(*) n, sum(third_party_flag) tp from ${t} group by 1,2,3`).join(" union all ")}
    ) group by 1,2,3 order by n desc`);

  const totals: Array<[string, unknown]> = [
    ["NC statements (KS1-4)", fmtN(one("select count(*) from curriculum_statements where level='statement'"))],
    ["Units", fmtN(one("select count(*) from units"))],
    ["Lessons", fmtN(one("select count(*) from lessons"))],
    ["Key learning points", fmtN(one("select count(*) from content_blocks where kind='key_learning_point'"))],
    ["Keywords", fmtN(one("select count(*) from content_blocks where kind='keyword'"))],
    ["Misconceptions", fmtN(one("select count(*) from content_blocks where kind='misconception'"))],
    ["Questions", fmtN(one("select count(*) from questions"))],
    ["Shown to students", fmtN(one("select count(*) from questions where review_status='auto_ok' and third_party_flag=0"))],
    ["Practice papers", fmtN(one("select count(*) from papers"))],
    ["Lesson→NC links", fmtN(one("select count(*) from lesson_statement_links"))],
    ["Unit→NC links (Oak)", fmtN(one("select count(*) from unit_statement_links where method='oak_mapping'"))],
    ["Tests passing", process.env.EDU_TEST_COUNT ?? "run npm test"],
  ];

  const blockedHosts = ["www.gov.uk", "assets.publishing.service.gov.uk", "www.nationalarchives.gov.uk", "www.thenational.academy", "open-api.thenational.academy"];

  const body = `
<h1>Eduworks: build report</h1>
<p class="sub">Generated ${esc(generated)} UTC from the platform database. Re-run with <code>npm run report</code> after each harvest.</p>

${card("Where things stand", `<p>The data layer, every ingester, the working site and the back office are built and committed. The curriculum backbone (National Curriculum 2014, KS1–4), 1,800+ Oak units and 13,000+ Oak lessons with key learning points, keywords and misconceptions were harvested through Oak's public GitHub repositories, because <b>all five requested hosts are blocked by this environment's network policy</b>. The STA papers, phonics, MTC guidance, gov.uk curriculum, DfE GCSE/A level and Oak API ingesters are complete and tested against fixtures. They run the moment the hosts are opened (and, for the Oak API, a key is added).</p>` + stats(totals))}

${card("1. What was harvested, per source", table(["Source", "Network", "Last run", "Records", "Raw files"], harvestRows, [4]))}

${card("2. What failed and why", `<ul>
<li><b>Network blocked (HTTP 403 from the sandbox proxy):</b> ${blockedHosts.map((h) => `<code>${h}</code>`).join(", ")}. Every gov.uk, STA and Oak API ingester logged <code>host_blocked</code> and stopped cleanly; nothing half-written.</li>
<li><b>Oak API:</b> also needs an API key. The bulk download needs the same key (checked in Oak's server code).</li>
<li><b>STA papers extractor:</b> verified only on synthetic PDFs that mimic STA layouts. Real mark-scheme table layouts are the main risk; every paper is validated (question count, marks total, arithmetic recomputed) and anything that fails goes to the review queue instead of being published.</li>
<li><b>Curriculum text quality:</b> the Oak ontology is an early release. Example spotted: a Year 4 statement reads "tenths or hundreds" where the programme of study says "hundredths". The gov.uk cross-check (built, blocked) marks each ontology statement verified or NOT FOUND.</li>
<li><b>722 statements</b> that Oak's own unit mapping cites were not in the ontology (spoken language, key-stage preambles, KS4 English/history, RSHE guidance). They are kept, flagged <code>oak_nc_mapping</code> / <code>rshe_guidance</code>, pending gov.uk verification.</li>
<li><b>337 units have no curriculum link</b> (mostly RE, which has no national programme of study, and KS4 options). They show as gaps in the coverage matrix.</li>
</ul>` + (problems.length ? `<h3>Warnings and errors from the latest runs</h3>` + table(["Source", "Level", "Code", "Message"], problems.map((p) => [p.source_id, pill(String(p.level), p.level === "error" ? "bad" : "warn"), p.code, String(p.message).slice(0, 300)])) : ""))}

${card("3. Coverage matrix (key stage × subject)", `<p class="small muted">Share of statements with at least one linked lesson / question. Per-strand detail is in the back office and in snapshot/coverage.html.</p>` + table(["KS", "Subject", "Statements", "With lessons", "With questions", "Lessons", "Questions", "Public Qs", "Gaps"], cov.map((c) => [String(c.ks).toUpperCase(), c.s, c.st, raw(`<span class="pill ${heat(pct(c.wl, c.st))}">${pct(c.wl, c.st)}%</span>`), raw(`<span class="pill ${heat(pct(c.wq, c.st))}">${pct(c.wq, c.st)}%</span>`), fmtN(Number(c.l)), fmtN(Number(c.qn)), fmtN(Number(c.pq)), c.g]), [2, 5, 6, 7, 8]))}

${card("4. Attribution table", table(["Attribution line", "Licence", "Source", "Records", "Third-party"], attr.map((a) => [a.a, a.l, a.s, fmtN(Number(a.n)), a.tp ?? 0]), [3, 4]))}

${card("5. Items needing your decision", `<ol>
<li><b>Open the network</b> for the five blocked hosts (steps in section 7). Everything else in the harvest depends on it.</li>
<li><b>Keyword practice questions (36,000+).</b> Built from Oak's keyword definitions (keyword → meaning multiple choice, and match-up). They are marked ready so the site has quizzes today. Keep them public, or hold them for review?</li>
<li><b>Statements from Oak's mapping that aren't in the NC ontology (722).</b> Recommended: keep them as flagged references until the gov.uk cross-check runs, then drop any gov.uk does not confirm.</li>
<li><b>gov.uk wording as the authority.</b> Recommended yes: when both exist, gov.uk text replaces the ontology text on the site and in the books.</li>
<li><b>Times tables check rules.</b> 25 questions, 6 seconds, 3-second pause and 3 practice questions are well established. The 2–12 range, no repeated fact pairs and the extra weight on the 6, 7, 8, 9 and 12 tables (platform default: at least 13 of 25) are stored as <i>unverified</i> until the STA guidance is harvested.</li>
<li><b>Phonics threshold.</b> 32 out of 40 is used (it has been 32 in every published year); stored as unverified until the per-year pages are read.</li>
<li><b>Two-mark arithmetic questions</b> in the original practice papers award both marks for a correct final answer. The real tests also give one method mark; parents can self-mark that on paper. Accept this policy?</li>
<li><b>Real book list and codes.</b> Seven demo books and codes are seeded (DEMO-KS2-MATHS and so on). Send the real titles and I will generate one code per title.</li>
<li><b>Extra GCSE / A level subjects</b> (economics, psychology, drama…) found in DfE documents are skipped until you want them on the subject list.</li>
<li><b>Admin password.</b> The demo admin password only works outside production. In production set ADMIN_EMAIL and ADMIN_PASSWORD.</li>
</ol>`)}

${card("6. What the site does now", `<ul>
<li><b>Sign-up with a book code:</b> code, parent name, email, Amazon order number (checked for the 3-7-7 digit format only), password, unticked optional marketing box kept separate from terms, links to privacy and terms. Every redemption is stored with the consent timestamp (set only when opted in).</li>
<li><b>Accounts:</b> email and password login, several books per account, child profiles with first name and school year only.</li>
<li><b>Browse:</b> choose child → key stage → year → subject; units by year or the curriculum tree (strand › sub-strand › statement, with lesson counts); unit pages with prior knowledge and curriculum links; lesson pages with outcome, key learning, keywords, common mistakes, resources and quizzes.</li>
<li><b>Quiz player:</b> auto-marks mcq, multi-select, numeric (with fraction/decimal rules), exact text, ordering, matching and table-fill questions. Self-mark questions show the mark scheme with tick boxes. Instant feedback, final score, stars and retry. Answers are marked on the server and never sent to the browser early.</li>
<li><b>Timed paper mode:</b> countdown, question grid navigation, flags, review screen, self-marking step, score and a breakdown by curriculum area. Five original arithmetic papers (3 × KS2 at 36 questions / 40 marks / 30 minutes, 2 × KS1). Past SATs papers slot in automatically once harvested and validated.</li>
<li><b>Phonics check practice:</b> 40 words in two sections, alien for pseudo-words, parent taps right/wrong, score out of 40 against the threshold, list of words to practise. Three original sets, all pseudo-words checked against a 275,000-word dictionary.</li>
<li><b>Times tables check:</b> 3 practice + 25 scored questions, 6-second timer, 3-second pause, on-screen number pad, score out of 25 and facts to practise.</li>
<li><b>Progress for parents:</b> streak, stars, weak areas, scores by topic, paper, and curriculum statement, and full history.</li>
<li><b>Credits and licences page</b> and an attribution footer on every page showing Oak- or STA-derived content. Privacy notice. No ads, chat or trackers.</li>
<li><b>Back office at /admin</b> (see snapshot/index.html for an offline copy of its data).</li>
<li><b>Demo logins:</b> parent <code>demo@example.com</code> / <code>Practice123</code> (children Sam, Year 6 and Ava, Year 1); admin <code>admin@example.com</code> / <code>admin-demo-2026</code> (outside production only).</li>
</ul>`)}

${card("7. Blocked until you supply these (one action each)", `<ol>
<li><b>Network access.</b> In the Claude app, open this session's cloud environment menu (title bar) → Edit → Network access. Choose a broader access level, or add these allowed domains: ${blockedHosts.map((h) => `<code>${h}</code>`).join(", ")}. Then say "continue" and I will run the harvest.</li>
<li><b>Oak API key.</b> Sign up at open-api.thenational.academy (free) and paste the key to me in chat. I will save it as <code>OAK_API_KEY</code> in the environment's secrets (not in git). Full crawl ≈ 40,000 requests, so it runs over several resumable sessions at Oak's hourly limit.</li>
<li><b>Supabase.</b> Create a free project at supabase.com. Then (a) open its SQL editor, paste the contents of <code>db/supabase/all_migrations.sql</code> and press Run; (b) send me the Project URL and the service_role key. I will add them as SUPABASE_URL and SUPABASE_SERVICE_KEY and push the data. The site then switches to Supabase automatically.</li>
<li><b>Vercel.</b> No Vercel connection is available in this session. Go to vercel.com → Add New → Project → Import the GitHub repo Kojixai/Eduworks → add the environment variables SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD → Deploy. (Supabase is needed on Vercel: the SQLite file is too large for a serverless function and would be read-only there.)</li>
</ol>`)}

${card("8. Five highest-value next steps", `<ol>
<li>Open the five hosts and run the harvest. That brings in real STA KS1/KS2 papers with mark schemes, the phonics word lists 2012 onwards, verified MTC rules, gov.uk-verified curriculum text and the GCSE/A level taxonomy.</li>
<li>Add the Oak API key: official starter and exit quizzes (6 questions each), transcripts, teacher tips, worksheets and slides for 13,000 lessons.</li>
<li>Connect Supabase and Vercel for a live, shareable preview with persistent accounts.</li>
<li>Work through the review queue: extracted STA questions, reasoned curriculum links and unverified rules. Only approved items reach children.</li>
<li>Load the real book catalogue and codes, then use the book-ready export to check a first title end to end, including its attribution lines.</li>
</ol>`)}

${card("How to run things (for reference; I do these for you)", `<ul class="small">
<li><code>npm run ingest</code>: idempotent run-everything (checkpoints in data/checkpoints; say "continue" to resume). Then <code>npm run db:export</code>, <code>npm run snapshot</code> and <code>npm run report</code>.</li>
<li><code>npm run db:build</code>: rebuild the SQLite database from the committed JSONL (fresh clone or CI).</li>
<li><code>npm test</code>: unit and integration tests. <code>node scripts/e2e-smoke.mjs</code>: browser smoke test at phone and desktop sizes.</li>
</ul>`)}
`;
  const out = path.join(process.cwd(), "reports", "final-report.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page("Eduworks build report", body));
  db.close();
  return out;
}

if (require.main === module) console.log(buildReport());
