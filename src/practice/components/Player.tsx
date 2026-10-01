"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { answerText, isResponseComplete, markQuestion, type MarkResult, type Response } from "@/practice/marking";
import { localDay } from "@/practice/mastery";
import type { Question, UnitContent } from "@/practice/types";
import { savePracticeAction, type SavedAttempt } from "@/app/books/actions";
import { Diagram } from "./Diagram";
import { initResponse, QuestionInput } from "./QuestionView";
import { TextPanel } from "./TextPanel";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));

interface Props {
  bookId: string;
  unitId: string;
  unitTitle: string;
  primary: boolean;
  studentId: string;
  content: UnitContent;
}

type Phase = "answering" | "retry-intro" | "saving" | "error";

export function Player({ content, bookId, unitId, unitTitle, primary, studentId }: Props) {
  const router = useRouter();
  const questions = content.unit.questions;
  const sessionId = useMemo(() => newId(), []);
  const [round, setRound] = useState<"first" | "retry">("first");
  const [queue, setQueue] = useState<number[]>(() => questions.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [result, setResult] = useState<MarkResult | null>(null);
  const [selfMarking, setSelfMarking] = useState(false);
  const [firstMarks, setFirstMarks] = useState<Record<string, MarkResult>>({});
  const [attempts, setAttempts] = useState<SavedAttempt[]>([]);
  const [phase, setPhase] = useState<Phase>("answering");
  const [msg, setMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [textOpen, setTextOpen] = useState(true);
  useEffect(() => {
    // On phones the text starts folded away so the question is visible; one tap opens it.
    if (window.matchMedia("(max-width: 760px)").matches) setTextOpen(false);
  }, []);

  const qi = queue[Math.min(pos, queue.length - 1)];
  const q: Question = questions[qi];
  const key = `${round}:${q.id}`;
  const response = responses[key] ?? initResponse(q, sessionId + round);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    promptRef.current?.focus();
  }, [pos, round]);
  useEffect(() => {
    if (result) feedbackRef.current?.focus();
  }, [result]);

  function setResponse(r: Response) {
    setMsg("");
    setResponses((prev) => ({ ...prev, [key]: r }));
  }

  function check() {
    if (q.type === "extended" && !selfMarking) {
      setSelfMarking(true);
      return;
    }
    if (!isResponseComplete(q, response)) {
      setMsg(q.type === "order" ? "Put the items in order first." : "Answer every part before you check.");
      return;
    }
    const res = markQuestion(q, response);
    setResult(res);
    const a: SavedAttempt = {
      questionId: q.id, isRetry: round === "retry",
      correct: res.correct, marksAwarded: res.marksAwarded, marksAvailable: res.marksAvailable, response,
    };
    setAttempts((prev) => [...prev, a]);
    if (round === "first") setFirstMarks((prev) => ({ ...prev, [q.id]: res }));
  }

  async function next() {
    setResult(null);
    setSelfMarking(false);
    setMsg("");
    if (pos + 1 < queue.length) {
      setPos(pos + 1);
      return;
    }
    if (round === "first") await finishFirstRound();
    else await finishRetry();
  }

  async function finishFirstRound() {
    setPhase("saving");
    try {
      const r = await savePracticeAction({ sessionId, studentId, bookId, unitId, day: localDay(new Date()), attempts: attempts.filter((x) => !x.isRetry) });
      if (!r.ok) throw new Error(r.error);
    } catch (e) {
      setSaveError((e as Error).message);
      setPhase("error");
      return;
    }
    const wrong = questions.map((qq, i) => ({ qq, i })).filter(({ qq }) => qq.type !== "extended" && !firstMarks[qq.id]?.correct).map(({ i }) => i);
    if (wrong.length) {
      setQueue(wrong);
      setPos(0);
      setPhase("retry-intro");
    } else router.push(`/books/${bookId}/${unitId}/results?s=${sessionId}`);
  }

  async function finishRetry() {
    setPhase("saving");
    const retryAttempts = attempts.filter((a) => a.isRetry);
    try {
      await savePracticeAction({ sessionId, studentId, bookId, unitId, day: localDay(new Date()), attempts: retryAttempts });
    } catch {
      /* the score is already saved; retries are a bonus */
    }
    router.push(`/books/${bookId}/${unitId}/results?s=${sessionId}&retried=${retryAttempts.filter((a) => a.correct).length}-${retryAttempts.length}`);
  }

  function startRetry() {
    setRound("retry");
    setPos(0);
    setPhase("answering");
  }

  const firstCorrect = Object.values(firstMarks).filter((m) => m.correct).length;
  const total = queue.length;
  const done = pos + (result ? 1 : 0);

  if (phase === "error")
    return (
      <div className="wrap wrap-narrow page">
        <div className="notice notice-bad" role="alert">
          <h2>Your score could not be saved</h2>
          <p>{saveError}</p>
          <button className="btn btn-primary" onClick={() => void finishFirstRound()}>Try saving again</button>
        </div>
      </div>
    );

  if (phase === "retry-intro" || phase === "saving")
    return (
      <div className={`player${primary ? " primary" : ""}`}>
        <div className="wrap wrap-narrow page">
          <div className="qcard" style={{ textAlign: "center" }} role="status" aria-live="polite">
            {phase === "saving" ? (
              <p>Saving your score...</p>
            ) : (
              <>
                <h1 style={{ fontSize: "1.8rem" }} tabIndex={-1} ref={(el) => el?.focus()}>
                  You got {firstCorrect} out of {questions.length} right first time
                </h1>
                <p className="lead" style={{ margin: "0 auto 24px" }}>
                  Your score is saved. Have another go at the {queue.length} you missed? This will not change your score, but it helps the right answer stick.
                </p>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button className="btn btn-section" onClick={startRetry} data-testid="start-retry">Try them again</button>
                  <Link className="btn btn-quiet" href={`/books/${bookId}/${unitId}/results?s=${sessionId}`}>See my results</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );

  const locked = !!result;
  return (
    <div className={`player${primary ? " primary" : ""}`}>
      <div className="player-top">
        <div className="wrap wrap-narrow">
          <span className="qcount" aria-live="polite">
            {round === "retry" ? "Have another go: " : ""}Question {pos + 1} of {total}
          </span>
          <div className="progress" role="progressbar" aria-label="Progress through this practice" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <Link
            href={`/books/${bookId}/${unitId}`}
            className="btn btn-quiet btn-small"
            onClick={(e) => {
              if (!window.confirm("Stop practising? Answers from this practice will not be saved.")) e.preventDefault();
            }}
          >
            Stop
          </Link>
        </div>
      </div>
      <div className="wrap wrap-narrow" style={{ paddingBottom: 64 }}>
        {round === "retry" && pos === 0 && !result && <p className="retry-note">Second go. These do not change your score.</p>}
        {content.text && (
          <details className="text-toggle" open={textOpen} onToggle={(e) => setTextOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>The text: {content.text.title}</summary>
            <TextPanel text={content.text} />
          </details>
        )}
        <form
          className="qcard"
          onSubmit={(e) => {
            e.preventDefault();
            if (result) void next();
            else check();
          }}
          aria-labelledby="q-prompt"
          noValidate
        >
          <div className="qhead">
            <span className="qnum" aria-hidden="true">{qi + 1}</span>
            <div>
              <h1 id="q-prompt" className="prompt" tabIndex={-1} ref={promptRef} style={{ fontSize: "1.12em", fontFamily: "var(--body)" }}>
                <span className="visually-hidden">Question {pos + 1}. </span>
                {q.type === "cloze" ? (q.answer.length > 1 ? `Fill in the ${q.answer.length} gaps.` : "Fill in the gap.") : q.prompt}
              </h1>
              <div className="qmarks">{q.marks} mark{q.marks === 1 ? "" : "s"}</div>
            </div>
          </div>
          {q.diagram && <Diagram spec={q.diagram} />}
          <div className="answer-area">
            <QuestionInput q={q} response={response} onChange={setResponse} locked={locked || selfMarking} seed={sessionId + round} />
          </div>

          {q.type === "extended" && selfMarking && !result && (
            <SelfMark q={q} response={response as Extract<Response, { type: "extended" }>} onChange={setResponse} />
          )}

          {result && <Feedback q={q} result={result} feedbackRef={feedbackRef} />}

          <div className="player-actions">
            {msg && <span className="msg" role="alert">{msg}</span>}
            {!result ? (
              <button type="submit" className="btn btn-section" data-testid="check">
                {q.type === "extended" ? (selfMarking ? "Save my mark" : "Show the model answer") : "Check my answer"}
              </button>
            ) : (
              <button type="submit" className="btn btn-section" data-testid="next">
                {pos + 1 < queue.length ? "Next question" : round === "first" ? "Finish" : "See my results"}
              </button>
            )}
          </div>
        </form>
        <p className="muted small" style={{ marginTop: 16 }}>{unitTitle}</p>
      </div>
    </div>
  );
}

function SelfMark({ q, response, onChange }: { q: Extract<Question, { type: "extended" }>; response: Extract<Response, { type: "extended" }>; onChange: (r: Response) => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="feedback neutral">
      <h3 tabIndex={-1} ref={ref}>Model answer</h3>
      <div className="model-answer">{q.model}</div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontFamily: "var(--head)", fontWeight: 600, marginBottom: 6 }}>Tick each point your answer made</legend>
        <div className="checklist">
          {q.checklist.map((c, i) => (
            <label key={i} className="check">
              <input
                type="checkbox"
                checked={response.ticked.includes(i)}
                onChange={(e) => onChange({ ...response, ticked: e.target.checked ? [...response.ticked, i] : response.ticked.filter((t) => t !== i) })}
                data-testid={`self-${i}`}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Feedback({ q, result, feedbackRef }: { q: Question; result: MarkResult; feedbackRef: React.RefObject<HTMLHeadingElement | null> }) {
  if (q.type === "extended") {
    return (
      <div className="feedback neutral" role="status">
        <h3 tabIndex={-1} ref={feedbackRef}>You gave yourself {result.marksAwarded} out of {result.marksAvailable} mark{result.marksAvailable === 1 ? "" : "s"}</h3>
        <p>{q.explanation}</p>
        <details className="disclose">
          <summary>See the model answer again</summary>
          <div className="model-answer">{q.model}</div>
        </details>
      </div>
    );
  }
  const showAnswer = !result.correct && !["mcq", "multi", "order", "match", "truefalse"].includes(q.type);
  return (
    <div className={`feedback ${result.correct ? "ok" : "bad"}`} role="status">
      <h3 tabIndex={-1} ref={feedbackRef}>
        {result.correct ? (
          <>
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="currentColor" /><path d="M7.5 13.5l3.6 3.6 7.4-8" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Correct
          </>
        ) : (
          <>
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="currentColor" /><path d="M9 9l8 8M17 9l-8 8" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" /></svg>
            Not quite
          </>
        )}
      </h3>
      {showAnswer && <p className="answer-line">The answer is {answerText(q)}.</p>}
      <p>{q.explanation}</p>
    </div>
  );
}
