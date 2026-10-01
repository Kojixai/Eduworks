/**
 * Everything the parent dashboard and the child home need about one learner, in one place.
 * An admin with no learners of their own gets a clearly-labelled sample learner so every view can be previewed.
 */
import "server-only";
import { activeChild, childrenOf, type Parent, type Student } from "./auth";
import { getStore } from "./db";
import { accessFor, allBooks, sessionsFor } from "./practice";
import type { CurriculumAttemptLite, PracticeAttemptLite, PracticeSessionLite } from "./dashboard";
import { SAMPLE_LEARNER, sampleActivity } from "./sample";
import type { BookSummary } from "@/practice/types";
import type { Access } from "./practice";

export interface LearnerCtx {
  learner: { id: string; first_name: string; avatar: string | null };
  kids: Student[];
  isSample: boolean;
  books: BookSummary[];
  access: Access[];
  owned: Set<string>;
  sessions: PracticeSessionLite[];
  practiceAttempts: PracticeAttemptLite[];
  curriculum: CurriculumAttemptLite[];
}

export async function loadLearner(parent: Parent, wantedId?: string): Promise<LearnerCtx | null> {
  const [kids, books, access] = await Promise.all([childrenOf(parent.id), allBooks(true), accessFor(parent.id)]);
  const owned = new Set(access.filter((a) => a.active).map((a) => a.bookId));
  const real = kids.find((k) => k.id === wantedId) ?? (await activeChild(parent)) ?? kids[0];

  if (!real) {
    if (!parent.is_admin) return null;
    const s = sampleActivity(books);
    return { learner: { id: SAMPLE_LEARNER.id, first_name: `${SAMPLE_LEARNER.first_name} (sample)`, avatar: SAMPLE_LEARNER.avatar }, kids, isSample: true, books, access, owned, sessions: s.sessions, practiceAttempts: s.attempts, curriculum: [] };
  }
  const store = await getStore();
  const [sessions, practiceAttempts, curriculum] = await Promise.all([
    sessionsFor([real.id]) as Promise<PracticeSessionLite[]>,
    store.select<PracticeAttemptLite>("practice_attempts", { where: { student_id: real.id }, columns: ["question_id", "book_id", "unit_id", "correct", "is_retry", "created_at"], orderBy: [["created_at", "desc"]], limit: 8000 }),
    store.select<CurriculumAttemptLite>("attempts", { where: { student_id: real.id }, columns: ["id", "kind", "title", "finished_at", "score", "max_score", "duration_seconds"], orderBy: [["started_at", "desc"]], limit: 600 }),
  ]);
  return { learner: { id: real.id, first_name: real.first_name, avatar: real.avatar }, kids, isSample: false, books, access, owned, sessions, practiceAttempts, curriculum };
}
