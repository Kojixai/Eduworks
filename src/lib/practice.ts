/**
 * Server-side access to the Inkworks practice banks, book access, and practice progress.
 * Questions are only returned by getUnitContent(), which callers must guard with hasBookAccess().
 */
import "server-only";
import { getStore } from "./db";
import type { Book, BookSummary, Section, Text, Unit, UnitContent, UnitMeta } from "@/practice/types";
import type { SessionLike } from "@/practice/mastery";

interface BookRow { id: string; title: string; key_stage: string; year_label: string; subject_label: string; pages: number; age_range: string; sections_json: string; sort: number; unit_count: number; question_count: number }
interface UnitRow { id: string; book_id: string; section_id: string; title: string; summary: string | null; book_pages_json: string; curriculum_json: string; text_id: string | null; sort: number; question_count: number; questions_json?: string }

const meta = (b: BookRow): BookSummary["meta"] => ({
  id: b.id, title: b.title, keyStage: b.key_stage as BookSummary["meta"]["keyStage"], year: b.year_label, subject: b.subject_label as BookSummary["meta"]["subject"],
  pages: b.pages, ageRange: b.age_range, sections: JSON.parse(b.sections_json) as Section[],
});
const unitMeta = (u: UnitRow): UnitMeta => ({
  id: u.id, section: u.section_id, title: u.title, bookPages: JSON.parse(u.book_pages_json), summary: u.summary ?? undefined, hasText: !!u.text_id, questionCount: u.question_count,
});

const UNIT_COLS = ["id", "book_id", "section_id", "title", "summary", "book_pages_json", "curriculum_json", "text_id", "sort", "question_count"];

export async function allBooks(withUnits = false): Promise<BookSummary[]> {
  const store = await getStore();
  const books = await store.select<BookRow>("practice_books", { orderBy: [["sort", "asc"]] });
  if (!withUnits) return books.map((b) => ({ meta: meta(b), units: [], fixture: false }));
  const units = await store.select<UnitRow>("practice_units", { columns: UNIT_COLS, orderBy: [["sort", "asc"]] });
  return books.map((b) => ({ meta: meta(b), units: units.filter((u) => u.book_id === b.id).map(unitMeta), fixture: false }));
}

export async function getBook(id: string): Promise<BookSummary | undefined> {
  const store = await getStore();
  const b = await store.first<BookRow>("practice_books", { where: { id } });
  if (!b) return undefined;
  const units = await store.select<UnitRow>("practice_units", { where: { book_id: id }, columns: UNIT_COLS, orderBy: [["sort", "asc"]] });
  return { meta: meta(b), units: units.map(unitMeta), fixture: false };
}

/** Questions for one unit. Callers must have checked hasBookAccess() first. */
export async function getUnitContent(bookId: string, unitId: string): Promise<UnitContent | null> {
  const store = await getStore();
  const u = await store.first<UnitRow>("practice_units", { where: { id: unitId, book_id: bookId } });
  if (!u) return null;
  const text = u.text_id ? await store.first<{ id: string; title: string; author: string; source: string; kind: Text["kind"]; lines_json: string; glossary_json: string | null }>("practice_texts", { where: { id: u.text_id } }) : null;
  const unit: Unit = {
    id: u.id, section: u.section_id, title: u.title, summary: u.summary ?? "", bookPages: JSON.parse(u.book_pages_json), curriculum: JSON.parse(u.curriculum_json),
    textId: text ? text.id.split(":").slice(1).join(":") : null, questions: JSON.parse(u.questions_json!),
  };
  return {
    unit,
    text: text ? { id: unit.textId!, title: text.title, author: text.author, source: text.source, kind: text.kind, lines: JSON.parse(text.lines_json), glossary: text.glossary_json ? JSON.parse(text.glossary_json) : undefined } : null,
  };
}

export async function unitMetaOf(bookId: string, unitId: string): Promise<UnitMeta | null> {
  const store = await getStore();
  const u = await store.first<UnitRow>("practice_units", { where: { id: unitId, book_id: bookId }, columns: UNIT_COLS });
  return u ? unitMeta(u) : null;
}

export interface Access { bookId: string; expiresAt: string; active: boolean }

export async function accessFor(parentId: string): Promise<Access[]> {
  const rows = await (await getStore()).select<{ book_id: string; expires_at: string }>("redemptions", { where: { parent_id: parentId }, columns: ["book_id", "expires_at"] });
  const now = new Date().toISOString();
  return rows.map((r) => ({ bookId: r.book_id, expiresAt: r.expires_at, active: r.expires_at > now }));
}

export async function hasBookAccess(parentId: string, bookId: string): Promise<boolean> {
  return (await accessFor(parentId)).some((a) => a.bookId === bookId && a.active);
}

export interface SessionRow extends SessionLike { id: string; studentId: string; bookId: string; correctCount: number; questionCount: number }

export async function sessionsFor(studentIds: string[], opts: { bookId?: string } = {}): Promise<SessionRow[]> {
  if (!studentIds.length) return [];
  const rows = await (await getStore()).select<{ id: string; student_id: string; book_id: string; unit_id: string; score: number; max_score: number; correct_count: number; question_count: number; day: string; completed_at: string }>(
    "practice_sessions",
    { where: { student_id: studentIds, ...(opts.bookId ? { book_id: opts.bookId } : {}) }, orderBy: [["completed_at", "asc"]] },
  );
  return rows.map((r) => ({ id: r.id, studentId: r.student_id, bookId: r.book_id, unitId: r.unit_id, score: r.score, maxScore: r.max_score, correctCount: r.correct_count, questionCount: r.question_count, day: r.day, completedAt: r.completed_at }));
}

/** First-time attempts that were wrong, newest first, for the "Mistakes" page. */
export async function mistakesFor(studentId: string, limit = 200) {
  const store = await getStore();
  const wrong = await store.select<{ book_id: string; unit_id: string; question_id: string; created_at: string }>("practice_attempts", { where: { student_id: studentId, correct: 0, is_retry: 0 }, orderBy: [["created_at", "desc"]], limit });
  // a question counts as still wrong only if it was not later answered correctly
  const right = new Set((await store.select<{ question_id: string }>("practice_attempts", { where: { student_id: studentId, correct: 1 }, columns: ["question_id"] })).map((r) => r.question_id));
  const seen = new Set<string>();
  return wrong.filter((w) => !right.has(w.question_id) && !seen.has(w.question_id) && seen.add(w.question_id));
}

export type { Book };
