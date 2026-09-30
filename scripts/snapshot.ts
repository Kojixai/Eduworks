/**
 * Offline snapshot of the back-office data: snapshot/index.html plus linked pages, each a
 * self-contained light HTML file you can open on a phone without the app running.
 */
import fs from "node:fs";
import path from "node:path";
import { SqliteStore } from "../src/lib/db/sqlite";
import { DEFAULT_SQLITE_PATH } from "../src/lib/db";
import { card, esc, fmtN, heat, page, pill, raw, stats, table } from "./html";

const OUT = path.join(process.cwd(), "snapshot");
type R = Record<string, unknown>;

export function buildSnapshot(dbPath = DEFAULT_SQLITE_PATH) {
  const db = new SqliteStore(dbPath);
  const q = <T = R>(sql: string, ...p: unknown[]) => db.raw<T>(sql, ...p);
  const one = (sql: string, ...p: unknown[]) => Number(Object.values(q(sql, ...p)[0] ?? { n: 0 })[0]);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const NAV: Array<[string, string]> = [
    ["index.html", "Dashboard"],
    ["sources.html", "Sources"],
    ["coverage.html", "Coverage"],
    ["curriculum-ks1.html", "KS1"],
    ["curriculum-ks2.html", "KS2"],
    ["curriculum-ks3.html", "KS3"],
    ["curriculum-ks4.html", "KS4"],
    ["papers.html", "Papers"],
    ["questions.html", "Questions"],
    ["review.html", "Needs review"],
    ["ingest.html", "Ingest log"],
    ["attribution.html", "Attribution"],
  ];
  const write = (f: string, title: string, body: string) => fs.writeFileSync(path.join(OUT, f), page(title, `<h1>${esc(title)}</h1><p class="sub">Snapshot generated ${esc(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC from the platform database.</p>${body}`, NAV));

  // ---- dashboard ----
  const totals: Array<[string, unknown]> = [
    ["NC statements", fmtN(one("select count(*) from curriculum_statements where level='statement'"))],
    ["Units", fmtN(one("select count(*) from units"))],
    ["Lessons", fmtN(one("select count(*) from lessons"))],
    ["Content blocks", fmtN(one("select count(*) from content_blocks"))],
    ["Questions", fmtN(one("select count(*) from questions"))],
    ["Public questions", fmtN(one("select count(*) from questions where review_status='auto_ok' and third_party_flag=0"))],
    ["Needs review", fmtN(one("select count(*) from questions where review_status='needs_review'"))],
    ["Papers", fmtN(one("select count(*) from papers"))],
    ["Phonics words", fmtN(one("select count(*) from phonics_words"))],
    ["Lesson→NC links", fmtN(one("select count(*) from lesson_statement_links"))],
    ["Redemptions", fmtN(one("select count(*) from redemptions"))],
    ["Opted-in emails", fmtN(one("select count(distinct email) from redemptions where marketing_opt_in=1"))],
  ];
  const latestRuns = q<R>(`select r.source_id, r.status, r.finished_at, r.stats_json, (select count(*) from ingest_logs l where l.run_id=r.id and l.level='warn') warns, (select count(*) from ingest_logs l where l.run_id=r.id and l.level='error') errs
    from ingest_runs r where r.started_at = (select max(started_at) from ingest_runs r2 where r2.source_id=r.source_id) order by r.source_id`);
  const tone = (s: unknown) => (s === "ok" ? "ok" : s === "blocked" || s === "partial" ? "warn" : "bad");
  const byType = q<R>("select qtype, quiz_kind, review_status, third_party_flag, count(*) n from questions group by 1,2,3,4 order by n desc");
  write(
    "index.html",
    "Back office snapshot",
    card("Totals", stats(totals)) +
      card("Ingest health (latest run per source)", table(["Source", "Status", "Finished", "Warnings", "Errors", "Stats"], latestRuns.map((r) => [r.source_id, pill(String(r.status), tone(r.status)), String(r.finished_at ?? "").slice(0, 16), r.warns, r.errs, raw(`<span class="small muted">${esc(r.stats_json)}</span>`)]), [3, 4])) +
      card("Questions by type and status", table(["Type", "Kind", "Review status", "Third party", "Count"], byType.map((r) => [r.qtype, r.quiz_kind, r.review_status, r.third_party_flag ? "yes" : "no", fmtN(Number(r.n))]), [4])),
  );

  // ---- sources ----
  const sources = q<R>("select s.*, (select count(*) from raw_files f where f.source_id=s.id) raw from sources s order by s.id");
  let research: R[] = [];
  try {
    research = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "research", "open_sources.json"), "utf8"));
  } catch {
    /* optional */
  }
  write(
    "sources.html",
    "Source registry",
    card("Sources", table(["Source", "Licence", "Access", "Licence evidence", "Raw files", "Attribution"], sources.map((s) => [raw(`<b>${esc(s.name)}</b><br><span class="small muted">${esc(s.home_url)}</span>`), s.licence_id, pill(String(s.access_status), s.access_status === "reachable" ? "ok" : "warn"), raw(`<span class="small">${esc(s.licence_evidence)}</span><br><span class="small muted">${esc(s.licence_evidence_url)}</span>`), s.raw, raw(`<span class="small">${esc(s.attribution_text)}</span>`)]), [4])) +
      card("Other open sources researched", table(["Source", "Licence", "Evidence", "Reachable now", "Recommendation"], research.map((r) => [raw(`<b>${esc(r.name)}</b><br><span class="small muted">${esc(r.url)}</span>`), pill(String(r.licence), r.licence === "OGL-3.0" || r.licence === "CC-BY-4.0" || r.licence === "CC0" ? "ok" : r.licence === "not-open" ? "bad" : "warn"), raw(`<span class="small">${esc(r.evidence_quote ?? (r as R).evidence_note ?? "")}</span>`), r.reachable_now ? "yes" : "no", raw(`<span class="small">${esc(r.recommendation)}</span>`)]))),
  );

  // ---- coverage ----
  const cov = q<R>("select * from coverage_matrix order by key_stage_id, subject_id, strand");
  const pctc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  write(
    "coverage.html",
    "Coverage matrix",
    card(
      "Key stage × subject × strand",
      `<p class="small muted">Cell colour: share of statements with at least one linked lesson (red &lt;30%, amber &lt;60%, light green &lt;90%, green ≥90%).</p>` +
        table(
          ["KS", "Subject", "Strand", "Statements", "With lessons", "With questions", "Lessons", "Questions", "Public Qs", "Gaps"],
          cov.map((c) => {
            const pl = pctc(Number(c.statements_with_lessons), Number(c.statement_count));
            const pq = pctc(Number(c.statements_with_questions), Number(c.statement_count));
            return [String(c.key_stage_id).toUpperCase(), c.subject_id, c.strand, c.statement_count, raw(`<span class="pill ${heat(pl)}">${pl}%</span>`), raw(`<span class="pill ${heat(pq)}">${pq}%</span>`), fmtN(Number(c.lesson_count)), fmtN(Number(c.question_count)), fmtN(Number(c.public_question_count)), c.gap_count];
          }),
          [3, 6, 7, 8, 9],
        ),
    ),
  );

  // ---- curriculum per KS ----
  for (const ks of ["ks1", "ks2", "ks3", "ks4"]) {
    const rows = q<R>(
      `select s.*, (select count(*) from lesson_statement_links l where l.statement_id=s.id) lessons, (select count(*) from question_statement_links x where x.statement_id=s.id) questions
       from curriculum_statements s where key_stage_id=? and level='statement' order by subject_id, sort`,
      ks,
    );
    const bySubj = new Map<string, R[]>();
    for (const r of rows) (bySubj.get(String(r.subject_id)) ?? bySubj.set(String(r.subject_id), []).get(String(r.subject_id))!).push(r);
    let body = "";
    for (const [subj, list] of bySubj)
      body += card(
        `${subj} (${list.length} statements)`,
        table(
          ["Strand", "Statement", "Years", "Ref", "Lessons", "Questions", "Framework / notes"],
          list.map((r) => [r.sub_strand && r.sub_strand !== r.strand ? `${r.strand} › ${r.sub_strand}` : r.strand, String(r.text).replace(/\[Fraction:(\d+)\/(\d+)\]/g, "$1/$2"), (JSON.parse(String(r.year_groups_json ?? "[]")) as string[]).join(" ").toUpperCase(), raw(`<code>${esc(r.ref ?? r.id)}</code>`), r.lessons, r.questions, raw(`${pill(String(r.framework), r.framework === "nc2014" ? "info" : "warn").html}${r.statutory ? "" : ` ${pill("non-statutory").html}`}`)]),
          [4, 5],
        ),
      );
    write(`curriculum-${ks}.html`, `Curriculum ${ks.toUpperCase()}`, body || card("", "<p>No statements.</p>"));
  }

  // ---- papers ----
  const papers = q<R>("select * from papers order by key_stage_id, year desc, name");
  let pbody = card("Papers", table(["Paper", "KS", "Year", "Kind", "Questions", "Marks", "Minutes", "Validation", "Review"], papers.map((p) => [p.name, String(p.key_stage_id).toUpperCase(), p.year ?? "", p.kind, p.question_count, p.total_marks, p.time_allowed_minutes, pill(String(p.validation_status), p.validation_status === "passed" ? "ok" : "bad"), pill(String(p.review_status), p.review_status === "auto_ok" ? "ok" : "warn")]), [4, 5, 6]));
  for (const p of papers) {
    const qs = q<R>("select q.*, (select group_concat(answer, ' | ') from accepted_answers a where a.question_id=q.id) answers from questions q where paper_id=? order by sort", p.id);
    pbody += `<details class="card"><summary>${esc(p.name)} — questions and answers</summary>${table(["#", "Prompt", "Answer(s)", "Marks", "Type", "Status"], qs.map((x) => [x.number, x.prompt_text, x.answers, x.marks, x.qtype, x.review_status]), [3])}</details>`;
  }
  write("papers.html", "Papers", pbody);

  // ---- questions sample ----
  const sample = q<R>("select q.id, q.qtype, q.quiz_kind, q.subject_id, q.key_stage_id, q.prompt_text, q.review_status, q.source_id, (select group_concat(text, ' | ') from question_options o where o.question_id=q.id and o.is_correct=1) correct from questions q where q.rowid % 150 = 0 limit 300");
  write("questions.html", "Question sample", card(`Every 150th question (${sample.length} of ${fmtN(one("select count(*) from questions"))})`, table(["Type", "Kind", "Subject", "KS", "Prompt", "Correct", "Status", "Source"], sample.map((x) => [x.qtype, x.quiz_kind, x.subject_id, x.key_stage_id, String(x.prompt_text).slice(0, 220), x.correct ?? "", x.review_status, x.source_id]))));

  // ---- review queue ----
  const review = q<R>("select id, qtype, subject_id, key_stage_id, prompt_text, review_notes, source_id from questions where review_status='needs_review' order by source_id, id limit 2000");
  const reasoned = q<R>("select l.unit_id, u.title, s.text, l.confidence from unit_statement_links l join units u on u.id=l.unit_id join curriculum_statements s on s.id=l.statement_id where l.review_status='needs_review' order by l.confidence desc limit 500");
  const unverified = q<R>("select assessment, rule_key, value, description from assessment_rules where verification_status!='verified' order by assessment, rule_key");
  write(
    "review.html",
    "Needs review",
    card(`Questions needing review (${review.length})`, review.length ? table(["Id", "Type", "Subject", "KS", "Prompt", "Notes", "Source"], review.map((r) => [raw(`<code>${esc(r.id)}</code>`), r.qtype, r.subject_id, r.key_stage_id, String(r.prompt_text).slice(0, 200), r.review_notes, r.source_id])) : "<p>None right now. Official papers and Oak quizzes will add items here once harvested.</p>") +
      card(`Suggested (reasoned) curriculum links (${reasoned.length})`, table(["Unit", "Statement", "Confidence"], reasoned.map((r) => [r.title, String(r.text).replace(/\[Fraction:(\d+)\/(\d+)\]/g, "$1/$2"), r.confidence]), [2])) +
      card(`Unverified assessment rules (${unverified.length})`, table(["Assessment", "Rule", "Value", "Description"], unverified.map((r) => [r.assessment, r.rule_key, r.value, r.description]))),
  );

  // ---- ingest log ----
  const runs = q<R>("select * from ingest_runs order by started_at desc limit 200");
  const logs = q<R>("select source_id, level, code, message, created_at from ingest_logs where level != 'info' order by created_at desc limit 500");
  write("ingest.html", "Ingest log", card("Runs", table(["Source", "Started", "Status", "Stats", "Error"], runs.map((r) => [r.source_id, String(r.started_at).slice(0, 19), pill(String(r.status), tone(r.status)), raw(`<span class="small">${esc(r.stats_json)}</span>`), r.error ?? ""]))) + card("Warnings and errors", table(["Source", "Level", "Code", "Message", "When"], logs.map((l) => [l.source_id, pill(String(l.level), l.level === "error" ? "bad" : "warn"), l.code, String(l.message).slice(0, 400), String(l.created_at).slice(0, 19)]))));

  // ---- attribution ----
  const tables = ["curriculum_statements", "units", "lessons", "content_blocks", "questions", "papers", "phonics_words", "assessment_rules"];
  const attr = new Map<string, { source: string; licence: string; counts: Record<string, number>; tp: number }>();
  for (const t of tables)
    for (const r of q<R>(`select attribution_text a, source_id s, licence_id l, count(*) n, sum(third_party_flag) tp from ${t} group by 1,2,3`)) {
      const k = `${r.a}|${r.s}|${r.l}`;
      const e = attr.get(k) ?? { source: String(r.s), licence: String(r.l), counts: {}, tp: 0 };
      e.counts[t] = Number(r.n);
      e.tp += Number(r.tp ?? 0);
      attr.set(k, e);
    }
  write("attribution.html", "Attribution report", card("Attribution lines in use", table(["Attribution text", "Source", "Licence", "Records", "Third-party"], [...attr.entries()].map(([k, e]) => [k.split("|")[0], e.source, e.licence, raw(Object.entries(e.counts).map(([t, n]) => `${esc(t)}: ${fmtN(n)}`).join("<br>")), e.tp]), [4])));

  db.close();
  return fs.readdirSync(OUT).map((f) => [f, fs.statSync(path.join(OUT, f)).size] as const);
}

if (require.main === module) for (const [f, s] of buildSnapshot()) console.log(f.padEnd(24), `${(s / 1024).toFixed(0)} KB`);
