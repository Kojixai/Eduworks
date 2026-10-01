/**
 * Sample learner for previewing the parent and child views without real data (used when an admin switches view and has
 * no learners of their own). Deterministic, built from the real book and topic ids, and always labelled as sample data.
 */
import type { BookSummary } from "@/practice/types";
import type { PracticeAttemptLite, PracticeSessionLite } from "@/lib/dashboard";

export const SAMPLE_LEARNER = { id: "sample", first_name: "Alex", avatar: "violet", year: "Year 3" };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const isoDay = (daysAgo: number, now: Date) => new Date(now.getTime() - daysAgo * 864e5).toISOString().slice(0, 10);

export function sampleActivity(books: BookSummary[], now = new Date()) {
  const rand = rng(20261001);
  const sessions: PracticeSessionLite[] = [];
  const attempts: PracticeAttemptLite[] = [];
  const picks = books.filter((b) => b.units.length).slice(0, 3);
  let n = 0;
  for (let ago = 20; ago >= 0; ago -= 1) {
    if (rand() < 0.38) continue; // not every day
    const b = picks[Math.floor(rand() * picks.length)];
    // work forward through the first dozen topics, sometimes revisiting
    const u = b.units[Math.min(b.units.length - 1, Math.floor(rand() * 8))];
    const score = Math.max(3, Math.min(10, Math.round(5 + rand() * 5 + (20 - ago) * 0.08)));
    const day = isoDay(ago, now), at = `${day}T1${Math.floor(rand() * 8)}:15:00.000Z`;
    sessions.push({ id: `sample-${n}`, unitId: u.id, bookId: b.meta.id, day, completedAt: at, score, maxScore: 10, correctCount: score, questionCount: 10 });
    for (let k = 0; k < 10; k++) attempts.push({ question_id: `${u.id}-q${String(k + 1).padStart(2, "0")}`, book_id: b.meta.id, unit_id: u.id, correct: k < score ? 1 : 0, is_retry: 0, created_at: at });
    n++;
  }
  return { sessions, attempts };
}
