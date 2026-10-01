import { NextResponse } from "next/server";
import { currentParent, activeChild } from "@/lib/auth";
import { markOne } from "@/lib/attempts";
import { correctAnswerText } from "@/lib/repo";
import type { Response } from "@/lib/questions/types";

/** Instant feedback for one question. Answers are only revealed after a response is submitted. */
export async function POST(req: Request) {
  const parent = await currentParent();
  if (!parent || !(await activeChild(parent))) return NextResponse.json({ error: "Please log in and choose a child." }, { status: 401 });
  const body = (await req.json()) as { questionId: string; response: Response | null; reveal?: boolean };
  const m = await markOne(body.questionId, body.response);
  if (!m) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  if (m.q.row.review_status !== "auto_ok" || m.q.row.third_party_flag) return NextResponse.json({ error: "Not available" }, { status: 404 });
  return NextResponse.json({
    result: m.q.row.qtype === "self_mark" && !body.response ? null : m.result,
    explanation: m.q.row.explanation,
    correctAnswer: correctAnswerText(m.q),
    markScheme: m.q.markScheme,
    parts: m.result.parts ?? null,
  });
}
