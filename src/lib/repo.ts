/**
 * Domain queries for the web app. Built only on DataStore primitives so SQLite and Supabase
 * behave the same. Student-facing question queries enforce the publication rule:
 * review_status = 'auto_ok' AND third_party_flag = 0.
 */
import "server-only";
import { getStore } from "./db";
import type { QOption, QAnswer, QuestionType, TableSpec } from "./questions/types";

export const PUBLIC_Q = { review_status: "auto_ok", third_party_flag: 0 } as const;

export interface Statement {
  id: string;
  subject_id: string;
  key_stage_id: string | null;
  year_group_id: string | null;
  year_groups_json: string | null;
  level: string;
  strand: string | null;
  sub_strand: string | null;
  parent_id: string | null;
  ref: string | null;
  text: string;
  statutory: number;
  framework: string;
  notes: string | null;
  attribution_text: string | null;
  source_id: string | null;
  source_url: string | null;
}
export interface Unit {
  id: string;
  subject_id: string;
  key_stage_id: string | null;
  year_group_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  why_this_why_now: string | null;
  prior_knowledge_json: string | null;
  exam_board: string | null;
  tier: string | null;
  sort: number;
  attribution_text: string | null;
}
export interface Lesson {
  id: string;
  unit_id: string | null;
  slug: string;
  title: string;
  pupil_outcome: string | null;
  external_url: string | null;
  attribution_text: string | null;
  third_party_flag: number;
  source_id: string | null;
}
export interface Block {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  extra_json: string | null;
  sort: number;
  attribution_text: string | null;
}
export interface QuestionRow {
  id: string;
  paper_id: string | null;
  lesson_id: string | null;
  quiz_kind: string;
  qtype: QuestionType;
  number: string | null;
  sort: number;
  marks: number;
  time_hint_seconds: number | null;
  prompt_text: string;
  prompt_images_json: string | null;
  prompt_extra_json: string | null;
  explanation: string | null;
  subject_id: string | null;
  key_stage_id: string | null;
  review_status: string;
  third_party_flag: number;
  attribution_text: string | null;
}
export interface Paper {
  id: string;
  key_stage_id: string;
  subject_id: string;
  year: number | null;
  name: string;
  kind: string;
  total_marks: number;
  time_allowed_minutes: number;
  question_count: number;
  review_status: string;
  third_party_flag: number;
  attribution_text: string | null;
  validation_status: string;
}

export async function keyStages() {
  return (await getStore()).select<{ id: string; name: string; phase: string; content_policy: string | null }>("key_stages", { orderBy: [["sort", "asc"]] });
}
export async function yearGroups() {
  return (await getStore()).select<{ id: string; key_stage_id: string; name: string }>("year_groups", { orderBy: [["sort", "asc"]] });
}
export async function subjects() {
  return (await getStore()).select<{ id: string; name: string; parent_id: string | null; sort: number }>("subjects", { orderBy: [["sort", "asc"]] });
}

/** Subjects that have units or statements in a key stage (and year, when given). */
export async function subjectsFor(ks: string, year?: string | null) {
  const store = await getStore();
  const units = await store.select<{ subject_id: string }>("units", { where: { key_stage_id: ks, ...(year ? { year_group_id: year } : {}) }, columns: ["subject_id"] });
  const st = await store.select<{ subject_id: string }>("curriculum_statements", { where: { key_stage_id: ks, level: "statement" }, columns: ["subject_id"] });
  const counts = new Map<string, { units: number; statements: number }>();
  for (const u of units) counts.set(u.subject_id, { units: (counts.get(u.subject_id)?.units ?? 0) + 1, statements: counts.get(u.subject_id)?.statements ?? 0 });
  for (const s of st) counts.set(s.subject_id, { units: counts.get(s.subject_id)?.units ?? 0, statements: (counts.get(s.subject_id)?.statements ?? 0) + 1 });
  const all = await subjects();
  return all.filter((s) => counts.has(s.id)).map((s) => ({ ...s, ...counts.get(s.id)! }));
}

export async function statementsFor(subject: string, ks: string) {
  const store = await getStore();
  // Languages and sciences: statements live on the umbrella subject
  const statementSubject = ["french", "german", "spanish"].includes(subject) ? "languages" : ["biology", "chemistry", "physics"].includes(subject) ? "science" : subject;
  const rows = await store.select<Statement>("curriculum_statements", { where: { subject_id: statementSubject, key_stage_id: ks }, orderBy: [["sort", "asc"]] });
  const aims = await store.select<Statement>("curriculum_statements", { where: { subject_id: statementSubject, level: "aim" }, orderBy: [["sort", "asc"]] });
  return { rows, aims };
}

/** Lesson counts per statement for a set of statements. */
export async function lessonCountsFor(statementIds: string[]) {
  const store = await getStore();
  const counts = new Map<string, number>();
  for (let i = 0; i < statementIds.length; i += 200) {
    const part = statementIds.slice(i, i + 200);
    for (const r of await store.select<{ statement_id: string }>("lesson_statement_links", { where: { statement_id: part }, columns: ["statement_id"] }))
      counts.set(r.statement_id, (counts.get(r.statement_id) ?? 0) + 1);
  }
  return counts;
}

export async function statement(id: string) {
  return (await getStore()).first<Statement>("curriculum_statements", { where: { id } });
}

export async function lessonsForStatement(statementId: string, limit = 60) {
  const store = await getStore();
  const links = await store.select<{ lesson_id: string; confidence: number; method: string; review_status: string }>("lesson_statement_links", {
    where: { statement_id: statementId },
    orderBy: [["confidence", "desc"]],
    limit,
  });
  const lessons = links.length ? await store.select<Lesson>("lessons", { where: { id: links.map((l) => l.lesson_id) } }) : [];
  const byId = new Map(lessons.map((l) => [l.id, l]));
  return links.map((l) => ({ ...l, lesson: byId.get(l.lesson_id)! })).filter((x) => x.lesson);
}

export async function unitsFor(subject: string, ks: string, year?: string | null) {
  return (await getStore()).select<Unit>("units", {
    where: { subject_id: subject, key_stage_id: ks, ...(year ? { year_group_id: year } : {}) },
    orderBy: [["year_group_id", "asc"], ["sort", "asc"], ["title", "asc"]],
  });
}

export async function unit(id: string) {
  const store = await getStore();
  const u = await store.first<Unit>("units", { where: { id } });
  if (!u) return null;
  const ul = await store.select<{ lesson_id: string; position: number }>("unit_lessons", { where: { unit_id: id }, orderBy: [["position", "asc"]] });
  const lessons = ul.length ? await store.select<Lesson>("lessons", { where: { id: ul.map((x) => x.lesson_id) } }) : [];
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const blocks = await store.select<Block>("content_blocks", { where: { unit_id: id, lesson_id: null }, orderBy: [["kind", "asc"], ["sort", "asc"]] });
  const links = await store.select<{ statement_id: string; method: string; confidence: number; review_status: string }>("unit_statement_links", { where: { unit_id: id } });
  const statements = links.length ? await store.select<Statement>("curriculum_statements", { where: { id: links.map((l) => l.statement_id) } }) : [];
  return {
    unit: u,
    lessons: ul.map((x) => byId.get(x.lesson_id)).filter(Boolean) as Lesson[],
    blocks,
    statements: statements.map((s) => ({ ...s, link: links.find((l) => l.statement_id === s.id)! })),
  };
}

export async function lesson(id: string) {
  const store = await getStore();
  const l = await store.first<Lesson>("lessons", { where: { id } });
  if (!l) return null;
  const blocks = await store.select<Block>("content_blocks", { where: { lesson_id: id }, orderBy: [["kind", "asc"], ["sort", "asc"]] });
  const assets = await store.select<{ id: string; kind: string; title: string | null; url: string | null; third_party_flag: number }>("assets", { where: { lesson_id: id } });
  const u = l.unit_id ? await store.first<Unit>("units", { where: { id: l.unit_id } }) : undefined;
  const quizCounts = new Map<string, number>();
  for (const q of await store.select<{ quiz_kind: string }>("questions", { where: { lesson_id: id, ...PUBLIC_Q }, columns: ["quiz_kind"] }))
    quizCounts.set(q.quiz_kind, (quizCounts.get(q.quiz_kind) ?? 0) + 1);
  const links = await store.select<{ statement_id: string }>("lesson_statement_links", { where: { lesson_id: id }, orderBy: [["confidence", "desc"]], limit: 8 });
  const statements = links.length ? await store.select<Statement>("curriculum_statements", { where: { id: links.map((x) => x.statement_id) } }) : [];
  return { lesson: l, unit: u ?? null, blocks, assets: assets.filter((a) => !a.third_party_flag), quizCounts, statements };
}

// ---------- questions ----------
export interface PlayableQuestion {
  id: string;
  qtype: QuestionType;
  number: string | null;
  marks: number;
  prompt: string;
  images: Array<{ path: string; alt?: string }>;
  options: Array<{ id: string; text: string; label?: string | null; side?: string | null; image_path?: string | null }>;
  table: TableSpec | null;
  timeHint: number | null;
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Strips answers: options keep only what the child needs to see; order/match items are shuffled. */
export function toPlayable(q: QuestionRow, options: QOption[]): PlayableQuestion {
  const extra = safeJson<{ table?: TableSpec } & TableSpec>(q.prompt_extra_json, {} as never);
  const table = q.qtype === "table_fill" ? (extra.table ?? (extra.cells ? { rows: extra.rows, cols: extra.cols, cells: extra.cells } : null)) : null;
  let opts = options.map((o) => ({ id: o.id, text: o.text, label: o.label ?? null, side: o.side ?? null, image_path: o.image_path ?? null, sort: o.sort ?? 0 }));
  opts.sort((a, b) => a.sort - b.sort);
  if (q.qtype === "ordering" || q.qtype === "matching") {
    // deterministic shuffle so the page renders the same on server and client
    const seed = [...q.id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
    opts = opts.map((o, i) => ({ o, k: (seed ^ (i * 2654435761)) >>> 0 })).sort((a, b) => a.k - b.k).map((x) => x.o);
  }
  return {
    id: q.id,
    qtype: q.qtype,
    number: q.number,
    marks: q.marks,
    prompt: q.prompt_text,
    images: safeJson(q.prompt_images_json, [] as Array<{ path: string; alt?: string }>),
    options: opts.map(({ sort: _s, ...o }) => o),
    table,
    timeHint: q.time_hint_seconds,
  };
}

export async function quizQuestions(filter: { lessonId?: string; paperId?: string; kind?: string }) {
  const store = await getStore();
  const where: Record<string, unknown> = { ...PUBLIC_Q };
  if (filter.lessonId) where.lesson_id = filter.lessonId;
  if (filter.paperId) where.paper_id = filter.paperId;
  if (filter.kind) where.quiz_kind = filter.kind;
  const qs = await store.select<QuestionRow>("questions", { where: where as never, orderBy: [["sort", "asc"]] });
  const opts = qs.length ? await store.select<QOption & { question_id: string }>("question_options", { where: { question_id: qs.map((q) => q.id) } }) : [];
  const byQ = new Map<string, QOption[]>();
  for (const o of opts) (byQ.get(o.question_id) ?? byQ.set(o.question_id, []).get(o.question_id)!).push(o);
  return qs.map((q) => ({ row: q, playable: toPlayable(q, byQ.get(q.id) ?? []) }));
}

/** Everything needed to mark one question server-side (never sent to the browser before answering). */
export async function questionForMarking(id: string) {
  const store = await getStore();
  const q = await store.first<QuestionRow>("questions", { where: { id } });
  if (!q) return null;
  const [options, answers, ms, links] = await Promise.all([
    store.select<QOption>("question_options", { where: { question_id: id } }),
    store.select<QAnswer>("accepted_answers", { where: { question_id: id } }),
    store.select<{ answer_text: string; guidance: string | null; marks: number | null }>("mark_scheme_entries", { where: { question_id: id }, orderBy: [["sort", "asc"]] }),
    store.select<{ statement_id: string }>("question_statement_links", { where: { question_id: id }, columns: ["statement_id"] }),
  ]);
  let statementIds = links.map((l) => l.statement_id);
  if (!statementIds.length && q.lesson_id)
    statementIds = (await store.select<{ statement_id: string }>("lesson_statement_links", { where: { lesson_id: q.lesson_id }, columns: ["statement_id"] })).map((l) => l.statement_id);
  const extra = safeJson<{ table?: TableSpec } & Partial<TableSpec>>(q.prompt_extra_json, {});
  return { row: q, options, answers, markScheme: ms, statementIds, table: (extra.table ?? (extra.cells ? (extra as TableSpec) : null)) as TableSpec | null };
}

/** Human-readable correct answer for feedback. */
export function correctAnswerText(q: NonNullable<Awaited<ReturnType<typeof questionForMarking>>>): string {
  const truthy = (v: unknown) => v === 1 || v === true;
  switch (q.row.qtype) {
    case "mcq":
    case "multi_select":
      return q.options.filter((o) => truthy(o.is_correct)).map((o) => o.text).join("; ");
    case "numeric":
    case "text_exact":
      return q.answers.filter((a) => (a.part ?? "main") === "main").map((a) => a.answer).slice(0, 3).join(" or ");
    case "ordering":
      return [...q.options].sort((a, b) => (a.correct_position ?? 0) - (b.correct_position ?? 0)).map((o) => o.text).join(" → ");
    case "matching":
      return q.options.filter((o) => o.side === "L").map((l) => `${l.text} → ${q.options.find((r) => r.side === "R" && r.match_key === l.match_key)?.text ?? "?"}`).join("; ");
    case "table_fill":
      return q.answers.map((a) => `${a.part}: ${a.answer}`).join("; ");
    default:
      return q.markScheme.map((m) => m.answer_text).join(" / ");
  }
}

export async function papers(ks?: string) {
  const store = await getStore();
  return store.select<Paper>("papers", { where: { ...(ks ? { key_stage_id: ks } : {}), third_party_flag: 0 }, orderBy: [["key_stage_id", "asc"], ["year", "desc"], ["name", "asc"]] });
}
export async function paper(id: string) {
  return (await getStore()).first<Paper>("papers", { where: { id } });
}

export async function phonicsSets() {
  const store = await getStore();
  const rows = await store.select<{ set_name: string; check_year: number | null; kind: string }>("phonics_words", {
    where: { review_status: "auto_ok", third_party_flag: 0 },
    columns: ["set_name", "check_year", "kind"],
  });
  const m = new Map<string, { name: string; year: number | null; kind: string; count: number }>();
  for (const r of rows) {
    const e = m.get(r.set_name) ?? { name: r.set_name, year: r.check_year, kind: r.kind, count: 0 };
    e.count++;
    m.set(r.set_name, e);
  }
  return [...m.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}
export async function phonicsWords(setName: string) {
  return (await getStore()).select<{ id: string; section: number; position: number; word: string; is_pseudo: number; attribution_text: string | null }>("phonics_words", {
    where: { set_name: setName, review_status: "auto_ok", third_party_flag: 0 },
    orderBy: [["position", "asc"]],
  });
}
export async function assessmentRule(assessment: string, key: string) {
  return (await getStore()).first<{ value: string; verification_status: string; source_url: string | null }>("assessment_rules", { where: { assessment, rule_key: key } });
}
export async function phonicsThreshold(year: number | null) {
  const specific = year ? await assessmentRule("phonics_check", `threshold_${year}`) : undefined;
  const def = specific ?? (await assessmentRule("phonics_check", "threshold_default"));
  return { threshold: Number(def?.value ?? 32), verified: def?.verification_status === "verified" };
}
