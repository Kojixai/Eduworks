import { NextResponse } from "next/server";
import { currentParent, activeChild } from "@/lib/auth";
import { recordItemAttempt, recordQuestionAttempt, type QuestionResponse } from "@/lib/attempts";
import { getStore } from "@/lib/db";

type Body =
  | { kind: "quiz" | "paper"; refId: string; title: string; startedAt: string; durationSeconds: number; responses: QuestionResponse[] }
  | { kind: "phonics" | "mtc"; refId: string; title: string; startedAt: string; durationSeconds: number; items: Array<{ label: string; correct: boolean; response?: unknown }>; meta?: unknown };

export async function POST(req: Request) {
  const parent = await currentParent();
  const child = parent ? await activeChild(parent) : null;
  if (!parent || !child) return NextResponse.json({ error: "Please log in and choose a child." }, { status: 401 });
  const body = (await req.json()) as Body;
  if (body.kind === "quiz" || body.kind === "paper") {
    const r = await recordQuestionAttempt({ ...body, studentId: child.id });
    // group the breakdown by strand for the paper review screen
    const store = await getStore();
    const ids = [...r.breakdown.keys()];
    const sts = ids.length ? await store.select<{ id: string; strand: string | null; sub_strand: string | null; text: string }>("curriculum_statements", { where: { id: ids }, columns: ["id", "strand", "sub_strand", "text"] }) : [];
    // each question counts once per curriculum area, however many statements it links to
    const areaOf = new Map(sts.map((s) => [s.id, s.sub_strand ?? s.strand ?? "Other"]));
    const byArea = new Map<string, { marks: number; max: number }>();
    for (const q of r.perQuestion) {
      const areas = new Set(q.statementIds.map((id) => areaOf.get(id)).filter(Boolean) as string[]);
      for (const area of areas) {
        const e = byArea.get(area) ?? { marks: 0, max: 0 };
        e.marks += q.marks;
        e.max += q.max;
        byArea.set(area, e);
      }
    }
    return NextResponse.json({
      attemptId: r.attemptId,
      score: r.score,
      max: r.max,
      areas: [...byArea.entries()].map(([area, v]) => ({ area, ...v })).sort((a, b) => a.marks / a.max - b.marks / b.max),
      results: r.results.map((x) => ({ questionId: x.question_id, marks: x.marks_awarded, max: x.max_marks, correct: !!x.correct })),
    });
  }
  if (body.kind === "phonics" || body.kind === "mtc") {
    const r = await recordItemAttempt({ ...body, studentId: child.id });
    return NextResponse.json(r);
  }
  return NextResponse.json({ error: "Unknown attempt kind" }, { status: 400 });
}
