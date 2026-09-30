import "server-only";
import crypto from "node:crypto";
import { getStore } from "./db";
import { markQuestion } from "./questions/marking";
import type { Response } from "./questions/types";
import { questionForMarking } from "./repo";
import { topicProgressDeltas } from "./progress";

export interface QuestionResponse {
  questionId: string;
  response: Response | null;
}

export async function markOne(questionId: string, response: Response | null) {
  const q = await questionForMarking(questionId);
  if (!q) return null;
  const result = markQuestion(
    { id: q.row.id, qtype: q.row.qtype, marks: q.row.marks, options: q.options, answers: q.answers, table: q.table },
    response,
  );
  return { q, result };
}

/** Records a finished quiz or paper: marks every response on the server and updates topic progress. */
export async function recordQuestionAttempt(input: {
  studentId: string;
  kind: "quiz" | "paper";
  refId: string;
  title: string;
  startedAt: string;
  durationSeconds: number;
  responses: QuestionResponse[];
}) {
  const store = await getStore();
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();
  const results = [];
  let score = 0;
  let max = 0;
  const breakdown = new Map<string, { marks: number; max: number }>();
  const perQuestion: Array<{ statementIds: string[]; marks: number; max: number }> = [];
  for (const r of input.responses) {
    const m = await markOne(r.questionId, r.response);
    if (!m) continue;
    score += m.result.marksAwarded;
    max += m.result.maxMarks;
    const row = {
      id: crypto.randomUUID(),
      attempt_id: attemptId,
      question_id: r.questionId,
      item_label: m.q.row.number,
      response_json: JSON.stringify(r.response),
      marks_awarded: m.result.marksAwarded,
      max_marks: m.result.maxMarks,
      correct: m.result.correct ? 1 : 0,
      self_marked: m.result.selfMarked ? 1 : 0,
      statement_ids_json: JSON.stringify(m.q.statementIds),
      created_at: now,
    };
    results.push(row);
    perQuestion.push({ statementIds: m.q.statementIds, marks: m.result.marksAwarded, max: m.result.maxMarks });
    for (const sid of m.q.statementIds) {
      const b = breakdown.get(sid) ?? { marks: 0, max: 0 };
      b.marks += m.result.marksAwarded;
      b.max += m.result.maxMarks;
      breakdown.set(sid, b);
    }
  }
  await store.insert("attempts", {
    id: attemptId,
    student_id: input.studentId,
    kind: input.kind,
    ref_id: input.refId,
    title: input.title,
    started_at: input.startedAt,
    finished_at: now,
    score,
    max_score: max,
    duration_seconds: Math.round(input.durationSeconds),
    meta_json: null,
  });
  if (results.length) await store.insert("results", results);
  await applyTopicProgress(input.studentId, results, [{ key: `${input.kind === "paper" ? "paper" : "lesson"}:${input.refId}`, kind: input.kind === "paper" ? "paper" : "lesson" }]);
  return { attemptId, score, max, results, breakdown, perQuestion };
}

/** Records phonics / times-tables sessions, which have items rather than question rows. */
export async function recordItemAttempt(input: {
  studentId: string;
  kind: "phonics" | "mtc";
  refId: string;
  title: string;
  startedAt: string;
  durationSeconds: number;
  items: Array<{ label: string; correct: boolean; response?: unknown }>;
  meta?: unknown;
}) {
  const store = await getStore();
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();
  const score = input.items.filter((i) => i.correct).length;
  await store.insert("attempts", {
    id: attemptId,
    student_id: input.studentId,
    kind: input.kind,
    ref_id: input.refId,
    title: input.title,
    started_at: input.startedAt,
    finished_at: now,
    score,
    max_score: input.items.length,
    duration_seconds: Math.round(input.durationSeconds),
    meta_json: input.meta ? JSON.stringify(input.meta) : null,
  });
  const rows = input.items.map((i) => ({
    id: crypto.randomUUID(),
    attempt_id: attemptId,
    question_id: null,
    item_label: i.label,
    response_json: i.response === undefined ? null : JSON.stringify(i.response),
    marks_awarded: i.correct ? 1 : 0,
    max_marks: 1,
    correct: i.correct ? 1 : 0,
    self_marked: input.kind === "phonics" ? 1 : 0,
    statement_ids_json: null,
    created_at: now,
  }));
  if (rows.length) await store.insert("results", rows);
  await applyTopicProgress(input.studentId, rows, [{ key: `${input.kind}:${input.refId}`, kind: input.kind }]);
  return { attemptId, score, max: input.items.length };
}

async function applyTopicProgress(studentId: string, results: Array<{ marks_awarded: number; max_marks: number; statement_ids_json: string | null; attempt_id: string }>, extra: Array<{ key: string; kind: string }>) {
  const store = await getStore();
  const deltas = topicProgressDeltas(studentId, results, extra);
  const now = new Date().toISOString();
  for (const d of deltas) {
    const cur = await store.first<{ attempts: number; marks: number; max_marks: number }>("topic_progress", { where: { student_id: studentId, topic_key: d.topic_key } });
    await store.upsert(
      "topic_progress",
      {
        student_id: studentId,
        topic_key: d.topic_key,
        topic_kind: d.topic_kind,
        attempts: (cur?.attempts ?? 0) + 1,
        marks: (cur?.marks ?? 0) + d.marks,
        max_marks: (cur?.max_marks ?? 0) + d.max,
        last_at: now,
      },
      ["student_id", "topic_key"],
    );
  }
}
