"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PlayableQuestion } from "@/lib/repo";
import { QuestionInput, QuestionPrompt, SelfMark, defaultResponse, hasAnswer, type Draft } from "./QuestionInput";
import { Alert, Button, Card, ProgressBar, Stars } from "./ui";
import { starsFor } from "@/lib/progress";

type Stage = "intro" | "test" | "review" | "marking" | "done";
interface Result {
  score: number;
  max: number;
  areas: Array<{ area: string; marks: number; max: number }>;
  results: Array<{ questionId: string; marks: number; max: number; correct: boolean }>;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

export function PaperPlayer({ paperId, title, minutes, totalMarks, questions }: { paperId: string; title: string; minutes: number; totalMarks: number; questions: PlayableQuestion[] }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [i, setI] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [left, setLeft] = useState(minutes * 60);
  const [schemes, setSchemes] = useState<Record<string, Array<{ answer_text: string; guidance: string | null; marks: number | null }>>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string>("");
  const selfQs = questions.filter((q) => q.qtype === "self_mark");

  const toMarking = useCallback(async () => {
    setStage(selfQs.length ? "marking" : "done");
    if (selfQs.length) {
      const entries = await Promise.all(
        selfQs.map(async (q) => {
          const r = await fetch("/api/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: q.id, response: null }) });
          return [q.id, r.ok ? (await r.json()).markScheme : []] as const;
        }),
      );
      setSchemes(Object.fromEntries(entries));
    }
  }, [selfQs]);

  useEffect(() => {
    if (stage !== "test") return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [stage]);
  useEffect(() => {
    if (stage === "test" && left <= 0) void toMarking();
  }, [left, stage, toMarking]);

  const submit = async () => {
    setError(null);
    const res = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paper",
        refId: paperId,
        title,
        startedAt: started.current,
        durationSeconds: minutes * 60 - Math.max(0, left),
        responses: questions.map((q) => ({ questionId: q.id, response: defaultResponse(q, drafts[q.id] ?? null) })),
      }),
    });
    if (!res.ok) return setError("Could not save the result. Check you are still logged in.");
    setResult(await res.json());
    setStage("done");
  };
  useEffect(() => {
    if (stage === "done" && !result) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (stage === "intro")
    return (
      <Card>
        <p className="font-medium">{questions.length} questions · {totalMarks} marks · {minutes} minutes</p>
        <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>The timer starts when you press Start and cannot be paused, like the real test.</li>
          <li>You can move between questions and flag any to come back to.</li>
          <li>Questions that need a grown-up to mark are checked against the mark scheme at the end.</li>
        </ul>
        <Button
          full
          onClick={() => {
            started.current = new Date().toISOString();
            setStage("test");
          }}
        >
          Start
        </Button>
      </Card>
    );

  if (stage === "test" || stage === "review") {
    const q = questions[i];
    const answeredCount = questions.filter((x) => hasAnswer(x, drafts[x.id] ?? null)).length;
    return (
      <div>
        <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-border bg-bg px-4 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`font-mono text-[length:var(--font-size-lg)] font-semibold ${left < 60 ? "text-danger" : ""}`} aria-live="polite">
              {fmtTime(left)}
            </span>
            <span className="text-muted">
              {answeredCount}/{questions.length} answered
            </span>
            <Button variant="secondary" onClick={() => setStage(stage === "review" ? "test" : "review")}>
              {stage === "review" ? "Back to question" : "Review"}
            </Button>
          </div>
        </div>
        {stage === "review" ? (
          <Card title="Review your answers">
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {questions.map((x, n) => {
                const done = hasAnswer(x, drafts[x.id] ?? null);
                return (
                  <button
                    key={x.id}
                    onClick={() => {
                      setI(n);
                      setStage("test");
                    }}
                    className={`min-h-[44px] rounded border text-sm ${flags[x.id] ? "border-warning bg-warning-soft" : done ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}
                    aria-label={`Question ${n + 1}${done ? ", answered" : ", not answered"}${flags[x.id] ? ", flagged" : ""}`}
                  >
                    {x.number ?? n + 1}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">Blue: answered · Amber: flagged · White: not answered</p>
            <Button full className="mt-4" onClick={() => void toMarking()}>
              Finish and mark
            </Button>
          </Card>
        ) : (
          <Card>
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Question {q.number ?? i + 1}</span>
              <button className="min-h-[44px] px-2 text-primary" onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}>
                {flags[q.id] ? "★ Flagged" : "☆ Flag"}
              </button>
            </div>
            <QuestionPrompt q={q} />
            <QuestionInput q={q} value={drafts[q.id] ?? null} onChange={(v) => setDrafts((d) => ({ ...d, [q.id]: v }))} />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
                Previous
              </Button>
              {i < questions.length - 1 ? (
                <Button className="flex-1" onClick={() => setI(i + 1)}>
                  Next
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => setStage("review")}>
                  Review answers
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (stage === "marking")
    return (
      <div>
        <Alert>Time to mark the questions that need a grown-up. Compare the answer with the mark scheme and tick the marks earned.</Alert>
        {selfQs.map((q) => {
          const d = drafts[q.id];
          const awarded = d && "awarded" in d ? d.awarded : 0;
          return (
            <Card key={q.id} className="mb-3">
              <QuestionPrompt q={q} />
              {d && "text" in d && d.text && <p className="rounded bg-surface-muted p-2 text-sm">Answer given: {d.text}</p>}
              <SelfMark marks={q.marks} markScheme={schemes[q.id] ?? []} awarded={awarded} onChange={(n) => setDrafts((x) => ({ ...x, [q.id]: { awarded: n, text: d && "text" in d ? d.text : "" } }))} />
            </Card>
          );
        })}
        <Button full onClick={() => setStage("done")}>
          See results
        </Button>
      </div>
    );

  // done
  if (!result) return <Card>{error ? <p className="text-danger">{error}</p> : <p>Marking…</p>}</Card>;
  return (
    <div className="grid gap-3">
      <Card>
        <p className="text-sm text-muted">Your score</p>
        <p className="text-[length:var(--font-size-2xl)] font-semibold">
          {result.score} / {result.max}
        </p>
        <p className="text-2xl">
          <Stars n={starsFor(result.score, result.max)} />
        </p>
        <p className="text-sm text-muted">Time used: {fmtTime(minutes * 60 - Math.max(0, left))}</p>
      </Card>
      {result.areas.length > 0 && (
        <Card title="By curriculum area">
          <div className="grid gap-3">
            {result.areas.map((a) => (
              <div key={a.area}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{a.area}</span>
                  <span className="text-muted">
                    {a.marks}/{a.max}
                  </span>
                </div>
                <ProgressBar value={a.marks} max={a.max} tone={a.marks / a.max >= 0.8 ? "success" : a.marks / a.max >= 0.5 ? "primary" : "danger"} label={a.area} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Question by question">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
          {questions.map((q, n) => {
            const r = result.results.find((x) => x.questionId === q.id);
            return (
              <div key={q.id} className={`rounded border p-1 text-center text-xs ${r?.correct ? "border-success bg-success-soft" : r && r.marks > 0 ? "border-warning bg-warning-soft" : "border-danger bg-danger-soft"}`}>
                <div className="font-semibold">{q.number ?? n + 1}</div>
                <div>
                  {r?.marks ?? 0}/{r?.max ?? q.marks}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => window.location.reload()}>Try again</Button>
        <Link href="/progress" className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-border px-4 no-underline">
          See progress
        </Link>
      </div>
    </div>
  );
}
