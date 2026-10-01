import { describe, expect, it } from "vitest";
import { buildDashboard, type PracticeSessionLite } from "../src/lib/dashboard";
import type { BookSummary } from "../src/practice/types";

const book: BookSummary = {
  fixture: false,
  meta: { id: "b1", title: "Book One", keyStage: "KS2", year: "Year 3", subject: "Maths", pages: 10, ageRange: "7-8", sections: [{ id: "s", name: "S", colour: "#2360A8" }] },
  units: ["u1", "u2", "u3"].map((id) => ({ id, section: "s", title: id.toUpperCase(), bookPages: [1], hasText: false, questionCount: 10 })),
};
const sess = (id: string, unitId: string, day: string, score: number): PracticeSessionLite => ({ id, bookId: "b1", unitId, day, completedAt: `${day}T10:00:00.000Z`, score, maxScore: 10, correctCount: score, questionCount: 10 });
const base = { period: 7 as const, today: "2026-10-10", books: [book], unlocked: new Set(["b1"]), practiceAttempts: [], curriculum: [] };

describe("buildDashboard", () => {
  it("is empty with no activity", () => {
    const d = buildDashboard({ ...base, sessions: [] });
    expect(d.hasAnything).toBe(false);
    expect(d.totals).toMatchObject({ sessions: 0, questions: 0, accuracy: null, activeDays: 0 });
    expect(d.books[0]).toMatchObject({ secure: 0, practising: 0, notStarted: 3, total: 3 });
  });
  it("counts mastery with the 80%-on-2-days rule and flags topics due for review", () => {
    const d = buildDashboard({ ...base, sessions: [sess("a", "u1", "2026-10-01", 9), sess("b", "u1", "2026-10-05", 8), sess("c", "u2", "2026-10-08", 5)] });
    expect(d.books[0]).toMatchObject({ secure: 1, practising: 1, notStarted: 1, started: 2 });
    expect(d.focus.map((f) => f.unitId)).toContain("u2"); // low score, due again
  });
  it("totals only the chosen period and compares with the one before", () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, k) => ({ question_id: `q${k}`, book_id: "b1", unit_id: "u1", correct: 1, is_retry: 0, created_at: "2026-10-09T10:00:00.000Z" })),
      ...Array.from({ length: 4 }, (_, k) => ({ question_id: `p${k}`, book_id: "b1", unit_id: "u1", correct: 1, is_retry: 0, created_at: "2026-10-01T10:00:00.000Z" })),
      { question_id: "r", book_id: "b1", unit_id: "u1", correct: 0, is_retry: 1, created_at: "2026-10-09T10:00:00.000Z" }, // retries never count
    ];
    const d = buildDashboard({ ...base, sessions: [sess("a", "u1", "2026-10-09", 8)], practiceAttempts: attempts });
    expect(d.totals).toMatchObject({ sessions: 1, questions: 10, prevQuestions: 4, accuracy: 80, activeDays: 1 });
    expect(d.daily).toHaveLength(7);
    expect(d.daily.at(-2)?.questions).toBe(10);
  });
  it("includes curriculum quizzes and papers in totals, trend and recent activity", () => {
    const d = buildDashboard({ ...base, sessions: [], curriculum: [{ id: "x", kind: "paper", title: "KS2 Maths 2019", finished_at: "2026-10-09T09:00:00.000Z", score: 60, max_score: 80 }] });
    expect(d.totals).toMatchObject({ sessions: 1, accuracy: 75, activeDays: 1 });
    expect(d.recent[0]).toMatchObject({ kind: "paper", pct: 75 });
    expect(d.hasAnything).toBe(true);
  });
  it("ignores books that are not unlocked", () => {
    expect(buildDashboard({ ...base, unlocked: new Set(), sessions: [] }).books).toHaveLength(0);
  });
});
