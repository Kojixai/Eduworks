"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PlayableQuestion } from "@/lib/repo";
import { QuestionInput, QuestionPrompt, SelfMark, defaultResponse, hasAnswer, type Draft } from "./QuestionInput";
import { Alert, Badge, Button, Card, ProgressBar } from "./ui";

interface Feedback {
  result: { marksAwarded: number; maxMarks: number; correct: boolean } | null;
  explanation: string | null;
  correctAnswer: string;
  markScheme: Array<{ answer_text: string; guidance: string | null; marks: number | null }>;
  parts: Record<string, boolean> | null;
}

export function QuizPlayer({ questions, refId, title, backHref }: { questions: PlayableQuestion[]; refId: string; title: string; backHref: string }) {
  const [i, setI] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [busy, setBusy] = useState(false);
  const [final, setFinal] = useState<{ score: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(new Date().toISOString());
  const q = questions[i];
  const fb = q ? feedback[q.id] : undefined;

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const isSelf = q.qtype === "self_mark";
      const res = await fetch("/api/mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: q.id, response: isSelf ? null : defaultResponse(q, drafts[q.id] ?? null) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not check the answer");
      const data = (await res.json()) as Feedback;
      setFeedback((f) => ({ ...f, [q.id]: data }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "quiz",
          refId,
          title,
          startedAt: started.current,
          durationSeconds: (Date.now() - new Date(started.current).getTime()) / 1000,
          responses: questions.map((x) => ({ questionId: x.id, response: defaultResponse(x, drafts[x.id] ?? null) })),
        }),
      });
      if (!res.ok) throw new Error("Could not save the result");
      const j = await res.json();
      setFinal({ score: j.score, max: j.max });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setDrafts({});
    setFeedback({});
    setFinal(null);
    setI(0);
    started.current = new Date().toISOString();
  };

  const selfAwarded = useMemo(() => {
    const d = q ? drafts[q.id] : null;
    return d && "awarded" in d ? d.awarded : 0;
  }, [drafts, q]);

  if (!questions.length) return <Alert>No published questions for this quiz yet.</Alert>;

  if (final)
    return (
      <Card>
        <p className="text-sm text-muted">Quiz complete</p>
        <p className="text-[length:var(--font-size-2xl)] font-semibold">
          {final.score} / {final.max}
        </p>
        <p className="my-2 text-2xl">
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button onClick={retry}>Try again</Button>
          <Link href={backHref} className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-border px-4 no-underline">
            Back to lesson
          </Link>
        </div>
      </Card>
    );

  const answered = hasAnswer(q, drafts[q.id] ?? null);
  return (
    <div>
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>
            Question {i + 1} of {questions.length}
          </span>
        </div>
        <ProgressBar value={i + (fb ? 1 : 0)} max={questions.length} label="Quiz progress" />
      </div>
      <Card>
        <QuestionPrompt q={q} />
        <QuestionInput
          q={q}
          value={drafts[q.id] ?? null}
          onChange={(v) => setDrafts((d) => ({ ...d, [q.id]: q.qtype === "self_mark" && v && "text" in v ? { awarded: selfAwarded, text: v.text } : v }))}
          disabled={!!fb && q.qtype !== "self_mark"}
          parts={fb?.parts}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        {fb && q.qtype === "self_mark" && (
          <SelfMark
            marks={q.marks}
            markScheme={fb.markScheme}
            awarded={selfAwarded}
            onChange={(n) => setDrafts((d) => ({ ...d, [q.id]: { awarded: n, text: (d[q.id] && "text" in d[q.id]! ? (d[q.id] as { text?: string }).text : "") ?? "" } }))}
          />
        )}
        {fb && q.qtype !== "self_mark" && fb.result && (
          <div className={`mt-3 rounded-[var(--radius-md)] p-3 ${fb.result.correct ? "bg-success-soft" : "bg-danger-soft"}`} role="status">
            <p className="font-semibold">{fb.result.correct ? "Correct!" : "Not quite."}</p>
            {!fb.result.correct && (
              <p className="text-sm">
                Answer: <span className="font-medium">{fb.correctAnswer}</span>
              </p>
            )}
            {fb.explanation && <p className="mt-1 whitespace-pre-line text-sm">{fb.explanation}</p>}
            <p className="mt-1 text-xs">
              <Badge>{fb.result.marksAwarded} / {fb.result.maxMarks} marks</Badge>
            </p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {!fb ? (
            <Button onClick={check} disabled={busy || (!answered && q.qtype !== "self_mark")} full>
              {q.qtype === "self_mark" ? "Show mark scheme" : "Check answer"}
            </Button>
          ) : i < questions.length - 1 ? (
            <Button onClick={() => setI(i + 1)} full>
              Next question
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy} full>
              See my score
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
