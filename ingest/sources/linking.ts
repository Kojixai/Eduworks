/**
 * Curriculum linking + coverage.
 *  1. Units without an Oak mapping get "reasoned" links: TF-IDF cosine similarity between the unit
 *     (title, description, lesson titles, key learning points) and NC statements of the same
 *     subject and key stage. Confidence = similarity-based, always review_status needs_review.
 *  2. Lessons inherit their units' links (lesson_statement_links).
 *  3. Questions attached to lessons but without links inherit the lesson links.
 *  4. Coverage matrix: key stage x subject x strand, and dataset totals.
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk, now } from "../core/context";

const STOP = new Set(
  "the a an and or of to in on for with by from at as is are be this that these those their them they pupils should taught use using including understand know how what when which who can will about into through different range simple".split(
    " ",
  ),
);
export const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[fraction:(\d+)\/(\d+)\]/g, " fraction ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(s)$/, ""));

export class Tfidf {
  private df = new Map<string, number>();
  private n = 0;
  add(tokens: string[]) {
    this.n++;
    for (const t of new Set(tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }
  vec(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * Math.log(1 + this.n / (1 + (this.df.get(t) ?? 0)));
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }
}
export function cosine(a: Map<string, number>, b: Map<string, number>) {
  let s = 0;
  for (const [t, w] of a) s += w * (b.get(t) ?? 0);
  return s;
}

const STATEMENT_SUBJECT: Record<string, string> = {
  biology: "science",
  chemistry: "science",
  physics: "science",
  french: "languages",
  german: "languages",
  spanish: "languages",
};

export async function runLinking(store: DataStore) {
  const ctx = new IngestContext(store, "oak_graphs", "OGL-3.0", "Curriculum links");
  await ctx.start();
  try {
    await store.delete("unit_statement_links", { method: "reasoned" });
    await store.delete("lesson_statement_links", { method: ["oak_mapping", "reasoned", "inherited"] });

    const statements = await store.select<{ id: string; subject_id: string; key_stage_id: string; text: string; strand: string }>("curriculum_statements", {
      where: { level: ["statement", "sub_statement"] },
      columns: ["id", "subject_id", "key_stage_id", "text", "strand"],
    });
    const units = await store.select<{ id: string; subject_id: string; key_stage_id: string; title: string; description: string | null }>("units", {
      columns: ["id", "subject_id", "key_stage_id", "title", "description"],
    });
    const unitLinks = await store.select<{ unit_id: string; statement_id: string; method: string; confidence: number; review_status: string }>("unit_statement_links");
    const linkedUnits = new Set(unitLinks.map((l) => l.unit_id));
    const lessonsByUnit = new Map<string, string[]>();
    for (const r of await store.select<{ unit_id: string; lesson_id: string }>("unit_lessons"))
      (lessonsByUnit.get(r.unit_id) ?? lessonsByUnit.set(r.unit_id, []).get(r.unit_id)!).push(r.lesson_id);
    const lessonTitle = new Map((await store.select<{ id: string; title: string }>("lessons", { columns: ["id", "title"] })).map((l) => [l.id, l.title]));
    const klp = new Map<string, string[]>();
    for (const b of await store.select<{ lesson_id: string; body: string }>("content_blocks", { where: { kind: "key_learning_point" }, columns: ["lesson_id", "body"] }))
      (klp.get(b.lesson_id) ?? klp.set(b.lesson_id, []).get(b.lesson_id)!).push(b.body);

    // ---- 1. reasoned unit links ----
    const tf = new Tfidf();
    const stTok = new Map(statements.map((s) => [s.id, tokenize(s.text)]));
    for (const t of stTok.values()) tf.add(t);
    const stVec = new Map(statements.map((s) => [s.id, tf.vec(stTok.get(s.id)!)]));
    const pools = new Map<string, typeof statements>();
    for (const s of statements) {
      const k = `${s.subject_id}|${s.key_stage_id}`;
      (pools.get(k) ?? pools.set(k, []).get(k)!).push(s);
    }
    const reasoned: Row[] = [];
    let unlinkable = 0;
    for (const u of units) {
      if (linkedUnits.has(u.id)) continue;
      const subj = STATEMENT_SUBJECT[u.subject_id] ?? u.subject_id;
      const pool = pools.get(`${subj}|${u.key_stage_id}`) ?? [];
      if (!pool.length) {
        unlinkable++;
        continue;
      }
      const lessons = lessonsByUnit.get(u.id) ?? [];
      const text = [u.title, u.title, u.description ?? "", ...lessons.map((l) => lessonTitle.get(l) ?? ""), ...lessons.flatMap((l) => (klp.get(l) ?? []).slice(0, 3))].join(" ");
      const v = tf.vec(tokenize(text));
      const scored = pool.map((s) => ({ s, score: cosine(v, stVec.get(s.id)!) })).sort((a, b) => b.score - a.score);
      const best = scored[0]?.score ?? 0;
      if (best < 0.1) {
        unlinkable++;
        continue;
      }
      for (const { s, score } of scored.slice(0, 3)) {
        if (score < 0.1 || score < best * 0.7) break;
        reasoned.push({ unit_id: u.id, statement_id: s.id, method: "reasoned", confidence: Number(Math.min(0.75, score * 1.5).toFixed(3)), review_status: "needs_review" });
      }
    }
    for (const p of chunk(reasoned, 1000)) await store.upsert("unit_statement_links", p, ["unit_id", "statement_id"]);
    ctx.bump("reasoned_unit_links", reasoned.length);
    ctx.bump("units_without_any_link", unlinkable);

    // ---- 2. lessons inherit unit links ----
    const allUnitLinks = [...unitLinks, ...(reasoned as unknown as typeof unitLinks)];
    const byUnit = new Map<string, typeof unitLinks>();
    for (const l of allUnitLinks) (byUnit.get(l.unit_id) ?? byUnit.set(l.unit_id, []).get(l.unit_id)!).push(l);
    const lessonLinks = new Map<string, Row>();
    for (const [unitId, lessons] of lessonsByUnit)
      for (const lessonId of lessons)
        for (const l of byUnit.get(unitId) ?? []) {
          const k = `${lessonId}|${l.statement_id}`;
          const conf = Number((l.confidence * 0.9).toFixed(3));
          const prev = lessonLinks.get(k);
          if (!prev || (prev.confidence as number) < conf)
            lessonLinks.set(k, { lesson_id: lessonId, statement_id: l.statement_id, method: l.method === "reasoned" ? "reasoned" : "oak_mapping", confidence: conf, review_status: l.review_status });
        }
    for (const p of chunk([...lessonLinks.values()], 2000)) await store.upsert("lesson_statement_links", p, ["lesson_id", "statement_id"]);
    ctx.bump("lesson_statement_links", lessonLinks.size);

    // ---- 3. lesson questions without links inherit lesson links ----
    const linkedQ = new Set((await store.select<{ question_id: string }>("question_statement_links", { columns: ["question_id"] })).map((r) => r.question_id));
    const lq = await store.select<{ id: string; lesson_id: string }>("questions", { where: { lesson_id: { op: "ne", value: null } }, columns: ["id", "lesson_id"] });
    const byLesson = new Map<string, Row[]>();
    for (const r of lessonLinks.values()) (byLesson.get(r.lesson_id as string) ?? byLesson.set(r.lesson_id as string, []).get(r.lesson_id as string)!).push(r);
    const qLinks: Row[] = [];
    for (const q of lq) {
      if (linkedQ.has(q.id)) continue;
      for (const l of byLesson.get(q.lesson_id) ?? [])
        qLinks.push({ question_id: q.id, statement_id: l.statement_id, method: "inherited", confidence: Number(((l.confidence as number) * 0.9).toFixed(3)), review_status: l.review_status });
    }
    for (const p of chunk(qLinks, 2000)) await store.upsert("question_statement_links", p, ["question_id", "statement_id"]);
    ctx.bump("question_links_inherited", qLinks.length);

    await buildCoverage(store);
    await buildStats(store);
    await ctx.finish("ok");
    return ctx.getStats();
  } catch (e) {
    await ctx.log("error", "exception", String((e as Error).stack ?? e));
    await ctx.finish("failed", String(e));
    throw e;
  }
}

export async function buildCoverage(store: DataStore) {
  const statements = await store.select<{ id: string; subject_id: string; key_stage_id: string | null; strand: string | null }>("curriculum_statements", {
    where: { level: "statement" },
    columns: ["id", "subject_id", "key_stage_id", "strand"],
  });
  const lessonLinks = await store.select<{ lesson_id: string; statement_id: string }>("lesson_statement_links", { columns: ["lesson_id", "statement_id"] });
  const qLinks = await store.select<{ question_id: string; statement_id: string }>("question_statement_links", { columns: ["question_id", "statement_id"] });
  const pub = new Set(
    (await store.select<{ id: string }>("questions", { where: { review_status: "auto_ok", third_party_flag: 0 }, columns: ["id"] })).map((q) => q.id),
  );
  // sub_statements roll up to their parent statement
  const parentOf = new Map(
    (await store.select<{ id: string; parent_id: string }>("curriculum_statements", { where: { level: "sub_statement" }, columns: ["id", "parent_id"] })).map((s) => [s.id, s.parent_id]),
  );
  const up = (id: string) => parentOf.get(id) ?? id;
  const lessonsBySt = new Map<string, Set<string>>();
  for (const l of lessonLinks) (lessonsBySt.get(up(l.statement_id)) ?? lessonsBySt.set(up(l.statement_id), new Set()).get(up(l.statement_id))!).add(l.lesson_id);
  const qBySt = new Map<string, Set<string>>();
  for (const l of qLinks) (qBySt.get(up(l.statement_id)) ?? qBySt.set(up(l.statement_id), new Set()).get(up(l.statement_id))!).add(l.question_id);

  const cells = new Map<string, { ks: string; subject: string; strand: string; st: number; stL: number; stQ: number; lessons: Set<string>; qs: Set<string>; gaps: number }>();
  for (const s of statements) {
    const ks = s.key_stage_id ?? "all";
    const strand = s.strand ?? "General";
    const k = `${ks}|${s.subject_id}|${strand}`;
    const c = cells.get(k) ?? { ks, subject: s.subject_id, strand, st: 0, stL: 0, stQ: 0, lessons: new Set(), qs: new Set(), gaps: 0 };
    c.st++;
    const L = lessonsBySt.get(s.id);
    const Qs = qBySt.get(s.id);
    if (L?.size) c.stL++;
    if (Qs?.size) c.stQ++;
    if (!L?.size && !Qs?.size) c.gaps++;
    L?.forEach((x) => c.lessons.add(x));
    Qs?.forEach((x) => c.qs.add(x));
    cells.set(k, c);
  }
  await store.delete("coverage_matrix", { id: { op: "like", value: "%" } });
  const ts = now();
  const rows = [...cells.entries()].map(([id, c]) => ({
    id,
    key_stage_id: c.ks,
    subject_id: c.subject,
    strand: c.strand,
    statement_count: c.st,
    statements_with_lessons: c.stL,
    statements_with_questions: c.stQ,
    lesson_count: c.lessons.size,
    question_count: c.qs.size,
    public_question_count: [...c.qs].filter((q) => pub.has(q)).length,
    gap_count: c.gaps,
    computed_at: ts,
  }));
  for (const p of chunk(rows, 500)) await store.upsert("coverage_matrix", p, ["id"]);
  return rows.length;
}

export async function buildStats(store: DataStore) {
  const ts = now();
  const count = (t: string, w?: Record<string, never> | Parameters<DataStore["count"]>[1]) => store.count(t, w);
  const stats: Record<string, number> = {
    curriculum_statements: await count("curriculum_statements", { level: "statement" }),
    units: await count("units"),
    lessons: await count("lessons"),
    content_blocks: await count("content_blocks"),
    questions: await count("questions"),
    questions_public: await count("questions", { review_status: "auto_ok", third_party_flag: 0 }),
    questions_needs_review: await count("questions", { review_status: "needs_review" }),
    papers: await count("papers"),
    phonics_words: await count("phonics_words"),
    unit_statement_links: await count("unit_statement_links"),
    lesson_statement_links: await count("lesson_statement_links"),
    question_statement_links: await count("question_statement_links"),
  };
  await store.upsert("dataset_stats", Object.entries(stats).map(([key, v]) => ({ key, value: String(v), computed_at: ts })), ["key"]);
  return stats;
}
