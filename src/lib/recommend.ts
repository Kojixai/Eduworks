/**
 * "Recommended for you": a transparent, rule-based picker (no black box, no data leaves the site).
 *
 * Access comes only from owning a book, so recommendations come from three places:
 *  1. review     a topic is due for another go (1, 3 then 7 days after the last practice)
 *  2. strengthen topics related to one the learner found tricky, in books they own (same section or shared key words)
 *  3. next       the next unstarted topic in the book they practised most recently
 * Books they do NOT own appear only as clearly-labelled teasers ("Comes with the book"), never as playable content.
 */
import { groupByUnit, localDay, unitStatus, type SessionLike, type UnitStatus } from "@/practice/mastery";
import type { BookSummary, UnitMeta } from "@/practice/types";

export type RecKind = "review" | "strengthen" | "next" | "unlock";

export interface Recommendation {
  id: string;
  kind: RecKind;
  title: string;
  /** Why this was picked, in plain words a child or parent can read. */
  reason: string;
  href: string;
  bookId: string;
  bookTitle: string;
  /** Best score so far on the topic (0 to 100), when there is one. */
  pct: number | null;
  colour: string;
}

export interface StrugglingArea { word: string; units: number }

/** Shown to people, so keep the real word, not the stem. */
const realWords = (title: string) => new Map(words(title).map((w) => [stem(w), w] as const));

const STOP = new Set(["the", "and", "with", "from", "that", "this", "your", "into", "using", "use", "how", "what", "when", "why", "about", "text", "texts", "words", "word", "reading", "writing", "problems", "problem", "questions", "question", "skills", "skill", "work", "working", "page", "pages", "year", "years", "more", "less", "than", "making", "using", "know", "choosing", "finding"]);

const stem = (w: string) => (w.length > 7 ? w.slice(0, 6) : w.replace(/(ing|ion|ions|es|s)$/, ""));
const words = (title: string) => title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));

/** Crude stemming is enough here: "multiplying", "multiplication", "multiples" all start "multip". */
export function keywords(title: string): string[] {
  return [...new Set(words(title).map(stem))];
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const s = new Set(a);
  return b.filter((x) => s.has(x)).length / new Set([...a, ...b]).size;
}

interface Row { book: BookSummary; unit: UnitMeta; st: UnitStatus; kw: string[] }

export interface RecommendInput {
  books: BookSummary[];
  owned: Set<string>;
  sessions: (SessionLike & { bookId: string })[];
  today?: string;
  limit?: number;
}

export function recommend(i: RecommendInput): { items: Recommendation[]; struggling: StrugglingArea[] } {
  const today = i.today ?? localDay();
  const byUnit = groupByUnit(i.sessions);
  const rows: Row[] = i.books.filter((b) => i.owned.has(b.meta.id)).flatMap((book) =>
    book.units.map((unit) => ({ book, unit, st: unitStatus(byUnit.get(unit.id) ?? [], today), kw: keywords(unit.title) })));

  const colourOf = (b: BookSummary, section: string) => b.meta.sections.find((s) => s.id === section)?.colour ?? "#ff5c4c";
  const mk = (r: Row, kind: RecKind, reason: string): Recommendation => ({
    id: `${kind}:${r.unit.id}`, kind, title: r.unit.title, reason, href: `/books/${r.book.meta.id}/${r.unit.id}`,
    bookId: r.book.meta.id, bookTitle: r.book.meta.title, pct: r.st.sessions ? Math.round(r.st.bestPct * 100) : null, colour: colourOf(r.book, r.unit.section),
  });

  const out: Recommendation[] = [];
  const used = new Set<string>();
  const push = (rec: Recommendation, unitId: string) => { if (!used.has(unitId)) { used.add(unitId); out.push(rec); } };

  // 1. due for another go, weakest first
  const due = rows.filter((r) => r.st.due).sort((a, b) => a.st.bestPct - b.st.bestPct);
  for (const r of due.slice(0, 3)) push(mk(r, "review", `Ready for another go. Best so far ${Math.round(r.st.bestPct * 100)}%.`), r.unit.id);

  // 2. tricky topics (practised, latest score under 70% and not secure) -> related topics not yet secure
  const tricky = rows.filter((r) => r.st.state === "practising" && r.st.lastPct < 0.7).sort((a, b) => a.st.lastPct - b.st.lastPct);
  const struggling = new Map<string, { word: string; n: number }>();
  for (const t of tricky) for (const [st, word] of realWords(t.unit.title)) struggling.set(st, { word, n: (struggling.get(st)?.n ?? 0) + 1 });
  for (const t of tricky.slice(0, 3)) {
    const related = rows
      .filter((r) => r.unit.id !== t.unit.id && r.st.state !== "secure" && !used.has(r.unit.id))
      .map((r) => ({ r, score: overlap(t.kw, r.kw) + (r.unit.section === t.unit.section && r.book.meta.id === t.book.meta.id ? 0.15 : 0) }))
      .filter((x) => x.score >= 0.15)
      .sort((a, b) => b.score - a.score)[0];
    if (related) push(mk(related.r, "strengthen", `Builds on "${t.unit.title}", which was tricky (${Math.round(t.st.lastPct * 100)}%).`), related.r.unit.id);
  }

  // 3. next unstarted topic in the most recently practised book
  const latest = [...i.sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const bookOrder = latest ? [latest.bookId, ...i.books.map((b) => b.meta.id).filter((id) => id !== latest.bookId)] : i.books.map((b) => b.meta.id);
  for (const id of bookOrder) {
    const next = rows.find((r) => r.book.meta.id === id && r.st.state === "not-started" && !used.has(r.unit.id));
    if (next) { push(mk(next, "next", `Next in ${next.book.meta.title}.`), next.unit.id); if (out.length >= (i.limit ?? 6) - 1) break; }
  }

  // 4. teasers for books they do not own (never playable)
  const ownedKs = new Set(i.books.filter((b) => i.owned.has(b.meta.id)).map((b) => b.meta.keyStage));
  const locked = i.books.filter((b) => !i.owned.has(b.meta.id)).sort((a, b) => Number(ownedKs.has(b.meta.keyStage)) - Number(ownedKs.has(a.meta.keyStage))).reverse();
  const room = Math.max(0, (i.limit ?? 6) - out.length);
  for (const b of locked.slice(0, Math.min(2, room || 1))) {
    out.push({
      id: `unlock:${b.meta.id}`, kind: "unlock", title: b.meta.title, reason: `Comes with the printed book. ${b.units.length} topics, ${b.units.reduce((n, u) => n + u.questionCount, 0).toLocaleString("en-GB")} questions.`,
      href: `/books/${b.meta.id}`, bookId: b.meta.id, bookTitle: b.meta.title, pct: null, colour: b.meta.sections[0]?.colour ?? "#c291fe",
    });
  }

  return {
    items: out.slice(0, i.limit ?? 6),
    struggling: [...struggling.values()].sort((a, b) => b.n - a.n).slice(0, 4).map(({ word, n }) => ({ word, units: n })),
  };
}
