"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateMtc, markMtc, type MtcQuestion, type MtcRules } from "@/lib/mtc";
import { Alert, Button, Card, ProgressBar } from "@/components/ui";

type Phase = "intro" | "practice-intro" | "question" | "pause" | "check-intro" | "done";

export function MtcPlayer({ rules, rulesVerified, childName }: { rules: MtcRules; rulesVerified: boolean; childName: string }) {
  const [qs, setQs] = useState<MtcQuestion[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [typed, setTyped] = useState("");
  const [answers, setAnswers] = useState<Array<{ q: MtcQuestion; typed: string; correct: boolean; ms: number }>>([]);
  const [left, setLeft] = useState(rules.secondsPerQuestion * 1000);
  const shownAt = useRef(0);
  const started = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const q = qs[i];

  const submit = useCallback(
    (value: string, timedOut = false) => {
      if (!q) return;
      const ms = Date.now() - shownAt.current;
      const correct = !timedOut && markMtc(q, value, ms, rules);
      const rec = { q, typed: value, correct, ms };
      setAnswers((a) => [...a, rec]);
      setTyped("");
      const next = i + 1;
      if (next >= qs.length) {
        setPhase("done");
        return;
      }
      if (q.practice && !qs[next].practice) {
        setI(next);
        setPhase("check-intro");
        return;
      }
      setI(next);
      setPhase("pause");
    },
    [q, i, qs, rules],
  );

  // question timer
  useEffect(() => {
    if (phase !== "question") return;
    shownAt.current = Date.now();
    setLeft(rules.secondsPerQuestion * 1000);
    inputRef.current?.focus();
    const t = setInterval(() => {
      const remaining = rules.secondsPerQuestion * 1000 - (Date.now() - shownAt.current);
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        submit(inputRef.current?.value ?? "", true);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, i, rules.secondsPerQuestion, submit]);

  // pause between questions
  useEffect(() => {
    if (phase !== "pause") return;
    const t = setTimeout(() => setPhase("question"), rules.pauseSeconds * 1000);
    return () => clearTimeout(t);
  }, [phase, rules.pauseSeconds]);

  // save result
  useEffect(() => {
    if (phase !== "done") return;
    const scored = answers.filter((a) => !a.q.practice);
    void fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "mtc",
        refId: "mtc",
        title: "Multiplication tables check",
        startedAt: started.current,
        durationSeconds: (Date.now() - new Date(started.current).getTime()) / 1000,
        items: scored.map((a) => ({ label: `${a.q.a}×${a.q.b}`, correct: a.correct, response: { typed: a.typed, ms: a.ms } })),
      }),
    });
  }, [phase, answers]);

  const start = () => {
    setQs(generateMtc(Date.now(), rules));
    setAnswers([]);
    setI(0);
    started.current = new Date().toISOString();
    setPhase("practice-intro");
  };

  const pad = (d: string) => {
    if (d === "del") setTyped((t) => t.slice(0, -1));
    else if (d === "enter") submit(typed);
    else setTyped((t) => (t.length < 3 ? t + d : t));
  };

  if (phase === "intro")
    return (
      <Card>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            {rules.practiceCount} practice questions first, then {rules.questionCount} questions that count.
          </li>
          <li>
            {rules.secondsPerQuestion} seconds for each question, with a {rules.pauseSeconds}-second pause in between.
          </li>
          <li>Type the answer and press Enter. When time runs out the next question appears.</li>
        </ul>
        {!rulesVerified && <p className="mb-3 text-xs text-muted">Timings follow the published check format; they will be re-checked against the official guidance.</p>}
        <Button full onClick={start}>
          Start, {childName}!
        </Button>
      </Card>
    );
  if (phase === "practice-intro" || phase === "check-intro")
    return (
      <Card>
        <p className="mb-3 text-center text-[length:var(--font-size-lg)] font-medium">{phase === "practice-intro" ? "First, some practice questions." : "Well done! Now the real check starts."}</p>
        <Button full onClick={() => setPhase("question")}>
          {phase === "practice-intro" ? "Start practice" : "Start the check"}
        </Button>
      </Card>
    );
  if (phase === "done") {
    const scored = answers.filter((a) => !a.q.practice);
    const score = scored.filter((a) => a.correct).length;
    const wrong = scored.filter((a) => !a.correct);
    return (
      <Card>
        <p className="text-sm text-muted">Score</p>
        <p className="text-[length:var(--font-size-2xl)] font-semibold">
          {score} / {scored.length}
        </p>
        {wrong.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium">Facts to practise</p>
            <ul className="mt-1 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
              {wrong.map((a, n) => (
                <li key={n} className="rounded bg-danger-soft px-2 py-1">
                  {a.q.a} × {a.q.b} = {a.q.answer}
                  <span className="text-xs text-muted">{a.typed ? ` (you: ${a.typed})` : " (no answer)"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button full className="mt-4" onClick={start}>
          Try another check
        </Button>
      </Card>
    );
  }
  if (!q) return null;
  const scoredIndex = qs.filter((x) => !x.practice).indexOf(q);
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-muted">
        <span>{q.practice ? `Practice ${i + 1} of ${rules.practiceCount}` : `Question ${scoredIndex + 1} of ${rules.questionCount}`}</span>
      </div>
      {phase === "pause" ? (
        <Card>
          <div className="flex min-h-[260px] items-center justify-center text-muted">Get ready…</div>
        </Card>
      ) : (
        <Card>
          <ProgressBar value={left} max={rules.secondsPerQuestion * 1000} tone={left < 2000 ? "danger" : "primary"} label="Time left" />
          <p className="my-4 text-center text-[3rem] font-semibold">
            {q.a} × {q.b} =
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(typed);
            }}
          >
            <input
              ref={inputRef}
              aria-label="Answer"
              className="block min-h-[56px] w-full rounded-[var(--radius-md)] border border-border bg-surface text-center text-[2rem]"
              inputMode="none"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit(typed);
                }
              }}
            />
          </form>
          <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Number pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "enter"].map((d) => (
              <button key={d} type="button" onClick={() => pad(d)} className={`min-h-[56px] rounded-[var(--radius-md)] border border-border text-xl ${d === "enter" ? "bg-primary text-on-primary" : "bg-surface"}`}>
                {d === "del" ? "⌫" : d === "enter" ? "Enter" : d}
              </button>
            ))}
          </div>
        </Card>
      )}
      {q.practice && phase === "question" && <Alert tone="neutral">Practice questions don&apos;t count.</Alert>}
    </div>
  );
}
