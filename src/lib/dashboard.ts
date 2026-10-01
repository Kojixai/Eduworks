/**
 * Parent dashboard numbers. Pure functions over sessions and attempts so they are easy to test.
 * Deliberately no streaks, points or rankings (docs/INKWORKS_MERGE_BRIEF.txt rule 4): consistency is shown as
 * "active days", and mastery uses the same rule as the book pages (80% or more on 2 different days).
 */
import { addDays, groupByUnit, localDay, pct, unitStatus, type SessionLike, type UnitStatus } from "@/practice/mastery";
import type { BookSummary } from "@/practice/types";

export interface PracticeSessionLite extends SessionLike { id: string; bookId: string; correctCount: number; questionCount: number }
export interface CurriculumAttemptLite { id: string; kind: string; title: string | null; finished_at: string | null; score: number | null; max_score: number | null; duration_seconds?: number | null }
export interface PracticeAttemptLite { question_id: string; book_id: string; unit_id: string; correct: number; is_retry: number; created_at: string }

export type Period = 7 | 30 | 90;
export const PERIODS: Period[] = [7, 30, 90];

export interface DayPoint { day: string; label: string; questions: number }
export interface TrendPoint { day: string; pct: number; title: string }
export interface BookMastery { bookId: string; title: string; colour: string; secure: number; practising: number; notStarted: number; due: number; total: number; started: number }
export interface SectionProgress { bookId: string; bookTitle: string; sectionId: string; name: string; colour: string; started: number; total: number; secure: number; /** mean best score over started topics, 0 to 100, or null if none started */ avgBest: number | null }
export interface FocusItem { bookId: string; unitId: string; title: string; bookTitle: string; reason: "due" | "weak"; bestPct: number; sessions: number; nextDueDay: string | null }
export interface ActivityItem { at: string; kind: "practice" | "quiz" | "paper" | "phonics" | "mtc"; title: string; pct: number; detail: string }

export interface DashboardData {
  period: Period;
  totals: { sessions: number; questions: number; accuracy: number | null; activeDays: number; prevQuestions: number };
  daily: DayPoint[];
  trend: TrendPoint[];
  books: BookMastery[];
  sections: SectionProgress[];
  focus: FocusItem[];
  recent: ActivityItem[];
  hasAnything: boolean;
}

const dayOf = (iso: string) => localDay(new Date(iso));
const shortDay = (day: string) => new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2);

export interface DashboardInput {
  period: Period;
  today?: string;
  books: BookSummary[];
  /** books this adult has unlocked and not expired */
  unlocked: Set<string>;
  sessions: PracticeSessionLite[];
  practiceAttempts: PracticeAttemptLite[];
  curriculum: CurriculumAttemptLite[];
}

export function buildDashboard(i: DashboardInput): DashboardData {
  const today = i.today ?? localDay();
  const from = addDays(today, -(i.period - 1));
  const prevFrom = addDays(from, -i.period);
  const inRange = (d: string, a: string, b = today) => d >= a && d <= b;

  const firstGo = i.practiceAttempts.filter((a) => !a.is_retry);
  const curFin = i.curriculum.filter((a) => a.finished_at && a.max_score);

  // questions answered per day (practice first-go + curriculum marks as a proxy: one question = one item where known)
  const qByDay = new Map<string, number>();
  for (const a of firstGo) qByDay.set(dayOf(a.created_at), (qByDay.get(dayOf(a.created_at)) ?? 0) + 1);
  for (const a of curFin) qByDay.set(dayOf(a.finished_at!), (qByDay.get(dayOf(a.finished_at!)) ?? 0) + Math.max(1, Math.round(a.max_score ?? 0)));

  const sessionsIn = i.sessions.filter((s) => inRange(s.day, from));
  const curIn = curFin.filter((a) => inRange(dayOf(a.finished_at!), from));
  const questions = [...qByDay.entries()].filter(([d]) => inRange(d, from)).reduce((n, [, v]) => n + v, 0);
  const prevQuestions = [...qByDay.entries()].filter(([d]) => inRange(d, prevFrom, addDays(from, -1))).reduce((n, [, v]) => n + v, 0);

  const scored = [
    ...sessionsIn.map((s) => ({ s: s.score, m: s.maxScore })),
    ...curIn.map((a) => ({ s: a.score ?? 0, m: a.max_score ?? 0 })),
  ].filter((x) => x.m > 0);
  const accuracy = scored.length ? Math.round((scored.reduce((n, x) => n + x.s, 0) / scored.reduce((n, x) => n + x.m, 0)) * 100) : null;

  const activeDays = new Set([...sessionsIn.map((s) => s.day), ...curIn.map((a) => dayOf(a.finished_at!))]).size;

  // last 14 days bars (or fewer if the period is 7)
  const span = Math.min(i.period, 14);
  const daily: DayPoint[] = Array.from({ length: span }, (_, k) => {
    const day = addDays(today, -(span - 1 - k));
    return { day, label: shortDay(day), questions: qByDay.get(day) ?? 0 };
  });

  const trend: TrendPoint[] = [
    ...sessionsIn.map((s) => ({ day: s.day, at: s.completedAt, pct: Math.round(pct(s) * 100), title: "Book practice" })),
    ...curIn.map((a) => ({ day: dayOf(a.finished_at!), at: a.finished_at!, pct: Math.round(((a.score ?? 0) / (a.max_score ?? 1)) * 100), title: a.title ?? a.kind })),
  ].sort((a, b) => a.at.localeCompare(b.at)).map(({ day, pct: p, title }) => ({ day, pct: p, title }));

  // mastery across all time, for unlocked books
  const byUnit = groupByUnit(i.sessions);
  const books: BookMastery[] = [];
  const focus: FocusItem[] = [];
  const sections: SectionProgress[] = [];
  for (const b of i.books.filter((x) => i.unlocked.has(x.meta.id))) {
    const row: BookMastery = { bookId: b.meta.id, title: b.meta.title, colour: b.meta.sections[0]?.colour ?? "#1F4E8C", secure: 0, practising: 0, notStarted: 0, due: 0, total: b.units.length, started: 0 };
    for (const u of b.units) {
      const st: UnitStatus = unitStatus(byUnit.get(u.id) ?? [], today);
      if (st.state === "secure") row.secure++;
      else if (st.state === "practising") row.practising++;
      else row.notStarted++;
      if (st.state !== "not-started") row.started++;
      if (st.due) { row.due++; focus.push({ bookId: b.meta.id, unitId: u.id, title: u.title, bookTitle: b.meta.title, reason: "due", bestPct: Math.round(st.bestPct * 100), sessions: st.sessions, nextDueDay: st.nextDueDay }); }
      else if (st.state === "practising" && st.lastPct < 0.6) focus.push({ bookId: b.meta.id, unitId: u.id, title: u.title, bookTitle: b.meta.title, reason: "weak", bestPct: Math.round(st.bestPct * 100), sessions: st.sessions, nextDueDay: st.nextDueDay });
    }
    books.push(row);
    for (const sec of b.meta.sections) {
      const us = b.units.filter((u) => u.section === sec.id);
      if (!us.length) continue;
      const sts = us.map((u) => unitStatus(byUnit.get(u.id) ?? [], today));
      const started = sts.filter((x) => x.state !== "not-started");
      sections.push({
        bookId: b.meta.id, bookTitle: b.meta.title, sectionId: sec.id, name: sec.name, colour: sec.colour, total: us.length, started: started.length,
        secure: sts.filter((x) => x.state === "secure").length,
        avgBest: started.length ? Math.round((started.reduce((n, x) => n + x.bestPct, 0) / started.length) * 100) : null,
      });
    }
  }
  focus.sort((a, b) => (a.reason === b.reason ? a.bestPct - b.bestPct : a.reason === "due" ? -1 : 1));

  const titleOf = new Map(i.books.flatMap((b) => b.units.map((u) => [u.id, `${u.title}`] as const)));
  const recent: ActivityItem[] = [
    ...i.sessions.map((s) => ({ at: s.completedAt, kind: "practice" as const, title: titleOf.get(s.unitId) ?? "Practice", pct: Math.round(pct(s) * 100), detail: `${s.correctCount} of ${s.questionCount} right first time` })),
    ...curFin.map((a) => ({ at: a.finished_at!, kind: (["quiz", "paper", "phonics", "mtc"].includes(a.kind) ? a.kind : "quiz") as ActivityItem["kind"], title: a.title ?? a.kind, pct: Math.round(((a.score ?? 0) / (a.max_score ?? 1)) * 100), detail: `${a.score ?? 0} of ${a.max_score} marks` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return {
    period: i.period,
    totals: { sessions: sessionsIn.length + curIn.length, questions, accuracy, activeDays, prevQuestions },
    daily, trend, books, sections, focus: focus.slice(0, 6), recent,
    hasAnything: i.sessions.length > 0 || curFin.length > 0,
  };
}
