"use server";
import crypto from "node:crypto";
import { getStore } from "@/lib/db";
import { childrenOf, requireParent } from "@/lib/auth";
import { getUnitContent, hasBookAccess } from "@/lib/practice";

export interface SavedAttempt {
  questionId: string;
  isRetry: boolean;
  correct: boolean;
  marksAwarded: number;
  marksAvailable: number;
  response: unknown;
}
export interface SaveInput {
  sessionId: string;
  studentId: string;
  bookId: string;
  unitId: string;
  day: string;
  attempts: SavedAttempt[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Saves one finished practice (the first go counts for the score; retries are stored but never change it). */
export async function savePracticeAction(input: SaveInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parent = await requireParent();
  if (!(await childrenOf(parent.id)).some((c) => c.id === input.studentId)) return { ok: false, error: "That learner is not on your account." };
  if (!(await hasBookAccess(parent.id, input.bookId))) return { ok: false, error: "This book is not unlocked, or access has ended." };
  const content = await getUnitContent(input.bookId, input.unitId);
  if (!content) return { ok: false, error: "Unknown topic." };
  if (!DAY_RE.test(input.day)) return { ok: false, error: "Bad date." };

  const byId = new Map(content.unit.questions.map((q) => [q.id, q]));
  const store = await getStore();
  const sessionExists = await store.first("practice_sessions", { where: { id: input.sessionId } });
  const firstGo = input.attempts.filter((a) => !a.isRetry);
  const clean = input.attempts.filter((a) => byId.has(a.questionId)).map((a) => {
    const avail = byId.get(a.questionId)!.marks;
    const awarded = Math.min(Math.max(Number(a.marksAwarded) || 0, 0), avail);
    return { ...a, marksAvailable: avail, marksAwarded: awarded, correct: a.correct && awarded >= avail };
  });
  const now = new Date().toISOString();

  if (!sessionExists) {
    const first = clean.filter((a) => !a.isRetry);
    if (!first.length || firstGo.length > content.unit.questions.length + 1) return { ok: false, error: "Nothing to save." };
    await store.transaction(async () => {
      await store.insert("practice_sessions", {
        id: input.sessionId, student_id: input.studentId, book_id: input.bookId, unit_id: input.unitId,
        score: first.reduce((s, a) => s + a.marksAwarded, 0), max_score: first.reduce((s, a) => s + a.marksAvailable, 0),
        correct_count: first.filter((a) => a.correct).length, question_count: content.unit.questions.length, day: input.day, completed_at: now,
      });
      await store.insert("practice_attempts", first.map((a) => row(input, a, now)));
    });
    return { ok: true };
  }
  // retries arrive after the session was saved
  const existing = await store.first<{ student_id: string }>("practice_sessions", { where: { id: input.sessionId } });
  if (existing?.student_id !== input.studentId) return { ok: false, error: "Not your session." };
  const retries = clean.filter((a) => a.isRetry);
  if (retries.length) await store.insert("practice_attempts", retries.map((a) => row(input, a, now)));
  return { ok: true };
}

const row = (i: SaveInput, a: SavedAttempt, now: string) => ({
  id: crypto.randomUUID(), session_id: i.sessionId, student_id: i.studentId, book_id: i.bookId, unit_id: i.unitId, question_id: a.questionId,
  is_retry: a.isRetry ? 1 : 0, correct: a.correct ? 1 : 0, marks_awarded: a.marksAwarded, marks_available: a.marksAvailable,
  response_json: JSON.stringify(a.response ?? null).slice(0, 4000), created_at: now,
});
