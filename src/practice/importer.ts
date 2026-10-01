/**
 * Loads the Inkworks practice banks (content/inkworks/*.json) into the database.
 * Idempotent: a book whose file hash is unchanged is skipped. Every bank is validated first; one bad
 * bank aborts the whole import so unchecked questions never reach the site.
 * Also registers each book in `books` (so codes and ownership use the platform tables) with a demo code.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DataStore } from "../lib/db/store";
import { compareBookIds } from "./bookOrder";
import { demoCodeFor } from "./codes";
import type { Book } from "./types";
import { validateBook } from "./validate";

export const CONTENT_DIR = path.join(process.cwd(), "content", "inkworks");

const KS_ID: Record<string, string> = { KS1: "ks1", KS2: "ks2", KS3: "ks3", KS4: "ks4" };
const SUBJECT_ID: Record<string, string> = {
  Maths: "mathematics",
  English: "english",
  "English Literature": "english",
  "English Language": "english",
};

export function loadBanks(dir = CONTENT_DIR): Array<{ book: Book; hash: string; file: string }> {
  const out = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const book = JSON.parse(raw) as Book;
    const v = validateBook(book, file);
    if (v.errors.length) throw new Error(`${file} failed validation:\n  ${v.errors.slice(0, 8).join("\n  ")}`);
    out.push({ book, hash: crypto.createHash("sha256").update(raw).digest("hex"), file });
  }
  return out.sort((a, b) => compareBookIds(a.book.book.id, b.book.book.id));
}

export interface ImportSummary { books: number; units: number; questions: number; skipped: string[] }

export async function importInkworks(store: DataStore, opts: { dir?: string; force?: boolean; demoCodesActive?: boolean } = {}): Promise<ImportSummary> {
  const ts = new Date().toISOString();
  const sum: ImportSummary = { books: 0, units: 0, questions: 0, skipped: [] };
  const banks = loadBanks(opts.dir);
  for (const [sort, { book, hash }] of banks.entries()) {
    const m = book.book;
    const existing = await store.first<{ content_hash: string }>("practice_books", { where: { id: m.id } });
    if (existing?.content_hash === hash && !opts.force) { sum.skipped.push(m.id); continue; }
    const nQ = book.units.reduce((n, u) => n + u.questions.length, 0);

    await store.transaction(async () => {
      await store.delete("practice_units", { book_id: m.id });
      await store.delete("practice_texts", { book_id: m.id });
      await store.upsert("books", {
        id: m.id, title: m.title, key_stage_id: KS_ID[m.keyStage] ?? null, subject_id: SUBJECT_ID[m.subject] ?? null,
        year_group_id: null, isbn: null, description: `${m.year} ${m.subject}. Ages ${m.ageRange}. ${book.units.length} topics, ${nQ} practice questions.`,
        active: 1, created_at: ts,
      }, ["id"]);
      await store.upsert("practice_books", {
        id: m.id, title: m.title, key_stage: m.keyStage, year_label: m.year, subject_label: m.subject, pages: m.pages, age_range: m.ageRange,
        sections_json: JSON.stringify(m.sections), sort, unit_count: book.units.length, question_count: nQ, content_hash: hash,
      }, ["id"]);
      for (const t of book.texts ?? [])
        await store.insert("practice_texts", {
          id: `${m.id}:${t.id}`, book_id: m.id, title: t.title, author: t.author ?? null, source: t.source ?? null, kind: t.kind,
          lines_json: JSON.stringify(t.lines), glossary_json: t.glossary ? JSON.stringify(t.glossary) : null,
        });
      for (const [i, u] of book.units.entries())
        await store.insert("practice_units", {
          id: u.id, book_id: m.id, section_id: u.section, title: u.title, summary: u.summary ?? null,
          book_pages_json: JSON.stringify(u.bookPages ?? []), curriculum_json: JSON.stringify(u.curriculum ?? []),
          text_id: u.textId ? `${m.id}:${u.textId}` : null, sort: i, question_count: u.questions.length, questions_json: JSON.stringify(u.questions),
        });
      // one demo code per book; only usable where demo codes are allowed (see demoCodesAllowed)
      await store.upsert("book_codes", {
        id: `code-${m.id}`, book_id: m.id, code: demoCodeFor(m.id), kind: "title", active: opts.demoCodesActive ? 1 : 0, is_demo: 1, created_at: ts,
      }, ["id"]);
    });
    sum.books++; sum.units += book.units.length; sum.questions += nQ;
  }
  // the old placeholder demo books (no content) are retired
  for (const id of ["book-ks1-maths-y2", "book-y1-phonics", "book-y4-tables", "book-ks2-maths-y6", "book-ks2-english-y6", "book-ks3-science", "book-ks4-maths"]) {
    await store.delete("redemptions", { book_id: id });
    await store.delete("book_codes", { book_id: id });
    await store.delete("books", { id });
  }
  return sum;
}

/** Demo codes unlock real content, so they work only when explicitly allowed (local dev, or ALLOW_DEMO_CODES=1). */
export function demoCodesAllowed(): boolean {
  return process.env.ALLOW_DEMO_CODES === "1" || process.env.NODE_ENV !== "production";
}
