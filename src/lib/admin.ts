/**
 * Admin back-office helpers: pure formatting (CSV, mailing list, coverage shading), audited
 * review writes, and aggregation queries. Built on DataStore primitives only, so every helper
 * works on SQLite and Supabase alike. No "server-only" import so the pure parts are unit-testable.
 */
import crypto from "node:crypto";
import { CONTENT_TABLES, pkFor, type DataStore, type Row, type Where } from "./db/store";

// ---------------------------------------------------------------- constants

export const REVIEW_STATUSES = ["auto_ok", "needs_review", "rejected"] as const;
export const QTYPES = ["mcq", "multi_select", "numeric", "text_exact", "ordering", "matching", "table_fill", "self_mark"] as const;
export const QUIZ_KINDS = ["paper", "starter", "exit", "oak_question_bank", "derived", "generated"] as const;
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export const PAGE_SIZE = 50;

/** Tables the export endpoint serves: content tables plus redemptions (and the mailing_list view). */
export const EXPORTABLE_TABLES: string[] = [...CONTENT_TABLES, "redemptions"];
export const isExportable = (t: string) => EXPORTABLE_TABLES.includes(t) || t === "mailing_list";

/** Tables carrying the provenance block, reported on the attribution page. */
export const ATTRIBUTION_TABLES = ["curriculum_statements", "units", "lessons", "content_blocks", "questions", "papers", "phonics_words", "assessment_rules"] as const;

// ---------------------------------------------------------------- small pure helpers

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
}

export function fmtDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "–";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`;
}

/** Positive integer page number from a query param (1-based). */
export function pageOf(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Builds "/path?a=1&b=2" keeping current params, applying a patch (undefined/"" removes a key). */
export function hrefWith(path: string, current: Record<string, string | string[] | undefined>, patch: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined && s !== "") p.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

/** First value of a search param, trimmed; undefined when empty. */
export function param(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

export function countBy<T>(rows: T[], key: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 field escaping; also neutralises spreadsheet formula injection (=, +, -, @ at start). */
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (values: unknown[]) => values.map(csvEscape).join(",") + "\r\n";

export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return csvLine(cols) + rows.map((r) => csvLine(cols.map((c) => r[c]))).join("");
}

// ---------------------------------------------------------------- mailing list

export interface RedemptionRow {
  id?: string;
  parent_name: string;
  email: string;
  marketing_opt_in: number | boolean;
  consent_timestamp: string | null;
  created_at?: string;
  book_id?: string;
  book_title?: string | null;
}
export interface MailingRow {
  email: string;
  name: string;
  consent_timestamp: string;
  book: string;
}

/**
 * Only rows with marketing_opt_in = 1 (and a consent timestamp), one per email (case-insensitive).
 * The most recent consent wins; books the person redeemed are joined with "; ".
 */
export function mailingList(rows: RedemptionRow[]): MailingRow[] {
  const byEmail = new Map<string, MailingRow & { books: Set<string> }>();
  for (const r of rows) {
    if (!(r.marketing_opt_in === 1 || r.marketing_opt_in === true)) continue;
    const email = r.email.trim().toLowerCase();
    if (!email) continue;
    const consent = r.consent_timestamp ?? r.created_at ?? "";
    const book = r.book_title ?? r.book_id ?? "";
    const cur = byEmail.get(email);
    if (!cur) {
      byEmail.set(email, { email, name: r.parent_name, consent_timestamp: consent, book, books: new Set(book ? [book] : []) });
    } else {
      if (book) cur.books.add(book);
      if (consent > cur.consent_timestamp) {
        cur.consent_timestamp = consent;
        cur.name = r.parent_name;
      }
    }
  }
  return [...byEmail.values()]
    .map(({ books, ...m }) => ({ ...m, book: [...books].join("; ") }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

// ---------------------------------------------------------------- coverage shading

export const COVERAGE_GOOD = 80;
export const COVERAGE_OK = 50;
export type CoverageTone = "success" | "warning" | "danger";

/** >= 80% good (success), >= 50% partial (warning), below that a gap (danger). */
export function coverageTone(percent: number): CoverageTone {
  if (percent >= COVERAGE_GOOD) return "success";
  if (percent >= COVERAGE_OK) return "warning";
  return "danger";
}
export const TONE_BG: Record<CoverageTone, string> = { success: "bg-success-soft", warning: "bg-warning-soft", danger: "bg-danger-soft" };

// ---------------------------------------------------------------- audit + review writes

export interface AuditInput {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export function auditRow(a: AuditInput, now = new Date()) {
  return {
    id: crypto.randomUUID(),
    actor: a.actor,
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId,
    before_json: a.before === undefined ? null : JSON.stringify(a.before),
    after_json: a.after === undefined ? null : JSON.stringify(a.after),
    created_at: now.toISOString(),
  };
}

export async function writeAudit(store: DataStore, a: AuditInput) {
  const row = auditRow(a);
  await store.insert("admin_audit", row);
  return row;
}

const REVIEW_COLS = ["id", "review_status", "review_notes", "reviewed_at"];

/** Sets a question's review status (never deletes). Returns false when the question does not exist. */
export async function setQuestionReview(store: DataStore, actor: string, id: string, status: "auto_ok" | "rejected" | "needs_review", notes?: string): Promise<boolean> {
  const before = await store.first<Row>("questions", { where: { id }, columns: REVIEW_COLS });
  if (!before) return false;
  const patch: Row = { review_status: status, reviewed_at: status === "needs_review" ? null : new Date().toISOString() };
  if (notes !== undefined && notes.trim()) patch.review_notes = notes.trim();
  await store.transaction(async () => {
    await store.update("questions", { id }, patch);
    const action = status === "auto_ok" ? "approve" : status === "rejected" ? "reject" : "flag_for_review";
    await writeAudit(store, { actor, action, entity: "questions", entityId: id, before, after: { ...before, ...patch } });
  });
  return true;
}

export interface QuestionEdit {
  prompt_text: string;
  explanation: string | null;
  marks: number;
  qtype: string;
  review_notes: string | null;
  /** Main-part accepted answers, one per line. Undefined leaves answers untouched. */
  answers?: string[];
}

export const parseAnswerLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function validateEdit(e: QuestionEdit): string | null {
  if (!e.prompt_text.trim()) return "Prompt text is required.";
  if (!Number.isInteger(e.marks) || e.marks < 0 || e.marks > 100) return "Marks must be a whole number from 0 to 100.";
  if (!(QTYPES as readonly string[]).includes(e.qtype)) return "Unknown question type.";
  return null;
}

/** Edits a question and its main accepted answers, writing one audit row with before/after. */
export async function editQuestion(store: DataStore, actor: string, id: string, e: QuestionEdit): Promise<string | null> {
  const err = validateEdit(e);
  if (err) return err;
  const cols = ["id", "prompt_text", "explanation", "marks", "qtype", "review_notes"];
  const before = await store.first<Row>("questions", { where: { id }, columns: cols });
  if (!before) return "Question not found.";
  const beforeAnswers = await store.select<{ id: string; part: string; answer: string; kind: string; tolerance: number | null; case_sensitive: number }>("accepted_answers", {
    where: { question_id: id },
    orderBy: [["id", "asc"]],
  });
  const patch = { prompt_text: e.prompt_text.trim(), explanation: e.explanation?.trim() || null, marks: e.marks, qtype: e.qtype, review_notes: e.review_notes?.trim() || null };
  const main = beforeAnswers.filter((a) => a.part === "main");
  let afterAnswers = main.map((a) => a.answer);
  await store.transaction(async () => {
    await store.update("questions", { id }, patch);
    if (e.answers && e.answers.join("\n") !== main.map((a) => a.answer).join("\n")) {
      const tmpl = main[0];
      await store.delete("accepted_answers", { question_id: id, part: "main" });
      await store.insert(
        "accepted_answers",
        e.answers.map((answer) => ({
          id: crypto.randomUUID(),
          question_id: id,
          part: "main",
          answer,
          kind: tmpl?.kind ?? (e.qtype === "numeric" ? "numeric" : "exact"),
          tolerance: tmpl?.tolerance ?? null,
          case_sensitive: tmpl?.case_sensitive ?? 0,
        })),
      );
      afterAnswers = e.answers;
    }
    await writeAudit(store, {
      actor,
      action: "edit",
      entity: "questions",
      entityId: id,
      before: { ...before, accepted_answers: main.map((a) => a.answer) },
      after: { ...before, ...patch, accepted_answers: afterAnswers },
    });
  });
  return null;
}

export const LINK_TABLES = ["unit_statement_links", "lesson_statement_links"] as const;
export type LinkTable = (typeof LINK_TABLES)[number];

/** Approve/reject a statement link (auto_ok | rejected), audited. */
export async function setLinkReview(store: DataStore, actor: string, table: LinkTable, ownerId: string, statementId: string, status: "auto_ok" | "rejected"): Promise<boolean> {
  const ownerCol = table === "unit_statement_links" ? "unit_id" : "lesson_id";
  const where: Where = { [ownerCol]: ownerId, statement_id: statementId };
  const before = await store.first<Row>(table, { where });
  if (!before) return false;
  await store.transaction(async () => {
    await store.update(table, where, { review_status: status });
    await writeAudit(store, { actor, action: status === "auto_ok" ? "approve" : "reject", entity: table, entityId: `${ownerId}|${statementId}`, before, after: { ...before, review_status: status } });
  });
  return true;
}

// ---------------------------------------------------------------- answers (for book export / review summaries)

interface OptLite {
  text: string;
  is_correct: number;
  side?: string | null;
  match_key?: string | null;
  correct_position?: number | null;
  sort?: number;
}
interface AnsLite {
  part: string;
  answer: string;
}

/** Human-readable correct answer from options / accepted answers / mark scheme. */
export function answerText(qtype: string, options: OptLite[], answers: AnsLite[], markScheme: string[] = []): string {
  switch (qtype) {
    case "mcq":
    case "multi_select":
      return options.filter((o) => o.is_correct).map((o) => o.text).join("; ");
    case "ordering":
      return [...options].sort((a, b) => (a.correct_position ?? 0) - (b.correct_position ?? 0)).map((o) => o.text).join(" → ");
    case "matching":
      return options
        .filter((o) => o.side === "L")
        .map((l) => `${l.text} → ${options.find((r) => r.side === "R" && r.match_key === l.match_key)?.text ?? "?"}`)
        .join("; ");
    case "table_fill":
      return answers.map((a) => `${a.part}: ${a.answer}`).join("; ");
    case "numeric":
    case "text_exact":
      return answers.filter((a) => a.part === "main").map((a) => a.answer).join(" or ") || markScheme.join(" / ");
    default:
      return markScheme.join(" / ") || answers.map((a) => a.answer).join(" or ");
  }
}

// ---------------------------------------------------------------- aggregation queries

/** Runs `select ... where col in ids` in chunks (keeps SQLite params and PostgREST URLs small). */
export async function selectIn<T>(store: DataStore, table: string, col: string, ids: string[], opts: { columns?: string[]; where?: Where; orderBy?: Array<[string, "asc" | "desc"]> } = {}, chunk = 200): Promise<T[]> {
  const out: T[] = [];
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += chunk) out.push(...(await store.select<T>(table, { ...opts, where: { ...opts.where, [col]: uniq.slice(i, i + chunk) } })));
  return out;
}

export async function countIn(store: DataStore, table: string, col: string, ids: string[], extra: Where = {}): Promise<Map<string, number>> {
  return countBy(await selectIn<Record<string, string>>(store, table, col, ids, { columns: [col], where: extra }), (r) => r[col]);
}

export async function questionStatusMatrix(store: DataStore) {
  const out: Array<{ review_status: string; third_party_flag: number; n: number }> = [];
  for (const rs of REVIEW_STATUSES) for (const tp of [0, 1]) out.push({ review_status: rs, third_party_flag: tp, n: await store.count("questions", { review_status: rs, third_party_flag: tp }) });
  return out;
}

export interface IngestRun {
  id: string;
  source_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  stats_json: string | null;
  error: string | null;
}

/** Latest run per source with warn/error log counts for that run. */
export async function ingestHealth(store: DataStore) {
  const sources = await store.select<{ id: string; name: string; access_status: string; access_notes: string | null }>("sources", { orderBy: [["id", "asc"]] });
  return Promise.all(
    sources.map(async (s) => {
      const run = await store.first<IngestRun>("ingest_runs", { where: { source_id: s.id }, orderBy: [["started_at", "desc"]] });
      const warn = run ? await store.count("ingest_logs", { run_id: run.id, level: "warn" }) : 0;
      const error = run ? await store.count("ingest_logs", { run_id: run.id, level: "error" }) : 0;
      return { source: s, run: run ?? null, warn, error };
    }),
  );
}

export function statsSummary(json: string | null | undefined, max = 6): Array<[string, string]> {
  const o = safeJson<Record<string, unknown>>(json ?? null, {});
  if (!o || typeof o !== "object" || Array.isArray(o)) return [];
  return Object.entries(o)
    .slice(0, max)
    .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
}

export interface AttributionRow {
  attribution_text: string;
  source_id: string;
  licence_id: string;
  counts: Record<string, number>;
  total: number;
  third_party: number;
}

const g = globalThis as unknown as { __eduAttribution?: { at: number; data: Awaited<ReturnType<typeof computeAttribution>> } };

async function computeAttribution(store: DataStore) {
  const rows = new Map<string, AttributionRow>();
  const perTable: Array<{ table: string; total: number; missing: number; third_party: number }> = [];
  for (const table of ATTRIBUTION_TABLES) {
    const recs = await store.select<{ attribution_text: string | null; source_id: string | null; licence_id: string | null; third_party_flag: number }>(table, {
      columns: ["attribution_text", "source_id", "licence_id", "third_party_flag"],
    });
    let missing = 0;
    let tp = 0;
    for (const r of recs) {
      if (!r.attribution_text) missing++;
      if (r.third_party_flag) tp++;
      const k = `${r.attribution_text ?? ""}\u0000${r.source_id ?? ""}\u0000${r.licence_id ?? ""}`;
      const e = rows.get(k) ?? { attribution_text: r.attribution_text ?? "", source_id: r.source_id ?? "", licence_id: r.licence_id ?? "", counts: {}, total: 0, third_party: 0 };
      e.counts[table] = (e.counts[table] ?? 0) + 1;
      e.total++;
      if (r.third_party_flag) e.third_party++;
      rows.set(k, e);
    }
    perTable.push({ table, total: recs.length, missing, third_party: tp });
  }
  return { rows: [...rows.values()].sort((a, b) => b.total - a.total), perTable };
}

/** Attribution x source x licence across the provenance tables. Cached for 60 s (full-table scans). */
export async function attributionReport(store: DataStore, maxAgeMs = 60_000) {
  if (g.__eduAttribution && Date.now() - g.__eduAttribution.at < maxAgeMs) return g.__eduAttribution.data;
  const data = await computeAttribution(store);
  g.__eduAttribution = { at: Date.now(), data };
  return data;
}

// ---------------------------------------------------------------- export paging

/** Pages through a table in primary-key order; used by the streaming export route. */
export async function* pagedRows(store: DataStore, table: string, where: Where = {}, pageSize = 1000): AsyncGenerator<Row[]> {
  const orderBy = pkFor(table).map((c) => [c, "asc"] as [string, "asc"]);
  for (let offset = 0; ; offset += pageSize) {
    const rows = await store.select<Row>(table, { where, orderBy, limit: pageSize, offset });
    if (rows.length) yield rows;
    if (rows.length < pageSize) return;
  }
}

/** Redemptions with the book title attached (for the list and the mailing export). */
export async function redemptionsWithBooks(store: DataStore, opts: { limit?: number; offset?: number } = {}) {
  const rows = await store.select<RedemptionRow & { id: string; amazon_order_number: string; book_id: string; created_at: string; terms_accepted_at: string }>("redemptions", {
    orderBy: [["created_at", "desc"]],
    ...opts,
  });
  const books = rows.length ? await store.select<{ id: string; title: string }>("books", { where: { id: [...new Set(rows.map((r) => r.book_id))] }, columns: ["id", "title"] }) : [];
  const title = new Map(books.map((b) => [b.id, b.title]));
  return rows.map((r) => ({ ...r, book_title: title.get(r.book_id) ?? r.book_id }));
}
