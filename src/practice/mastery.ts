// Mastery and spaced practice.
// A unit is "secure" when the learner scores 80% or more (8 out of 10) on two different days.
// Units that are started but not secure come back for another go 1, 3 and then 7 days after the last practice.

export const SECURE_PCT = 0.8;
export const SECURE_DAYS = 2;
export const REVIEW_INTERVALS = [1, 3, 7];

export interface SessionLike {
  unitId: string;
  score: number;
  maxScore: number;
  completedAt: string; // ISO timestamp
  day: string; // learner's local date, YYYY-MM-DD
}

export type UnitState = "not-started" | "practising" | "secure";

export interface UnitStatus {
  state: UnitState;
  sessions: number;
  bestPct: number;
  lastPct: number;
  goodDays: number;
  lastDay: string | null;
  nextDueDay: string | null;
  due: boolean;
}

export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function pct(s: { score: number; maxScore: number }): number {
  return s.maxScore > 0 ? s.score / s.maxScore : 0;
}

export function unitStatus(sessions: SessionLike[], today: string = localDay()): UnitStatus {
  if (sessions.length === 0)
    return { state: "not-started", sessions: 0, bestPct: 0, lastPct: 0, goodDays: 0, lastDay: null, nextDueDay: null, due: false };
  const sorted = [...sessions].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const last = sorted[sorted.length - 1];
  const goodDays = new Set(sorted.filter((s) => pct(s) >= SECURE_PCT - 1e-9).map((s) => s.day)).size;
  const secure = goodDays >= SECURE_DAYS;
  const interval = REVIEW_INTERVALS[Math.min(sorted.length - 1, REVIEW_INTERVALS.length - 1)];
  const nextDueDay = secure ? null : addDays(last.day, interval);
  return {
    state: secure ? "secure" : "practising",
    sessions: sorted.length,
    bestPct: Math.max(...sorted.map(pct)),
    lastPct: pct(last),
    goodDays,
    lastDay: last.day,
    nextDueDay,
    due: !secure && nextDueDay !== null && today >= nextDueDay,
  };
}

export function groupByUnit<T extends { unitId: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const list = m.get(it.unitId) ?? [];
    list.push(it);
    m.set(it.unitId, list);
  }
  return m;
}

/** Days left on a book, rounded up, never negative. */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400000));
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
