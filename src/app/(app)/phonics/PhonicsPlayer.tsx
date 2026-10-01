"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, ProgressBar } from "@/components/ui";

interface W {
  id: string;
  word: string;
  pseudo: boolean;
  section: number;
}

export function PhonicsPlayer({ setName, words, threshold, thresholdVerified }: { setName: string; words: W[]; threshold: number; thresholdVerified: boolean }) {
  const [i, setI] = useState(0);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [saved, setSaved] = useState<null | { score: number }>(null);
  const started = useRef(new Date().toISOString());
  const done = i >= words.length;

  const mark = async (ok: boolean) => {
    const next = [...marks, ok];
    setMarks(next);
    setI(i + 1);
    if (next.length === words.length) {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "phonics",
          refId: setName,
          title: `Phonics: ${setName}`,
          startedAt: started.current,
          durationSeconds: (Date.now() - new Date(started.current).getTime()) / 1000,
          items: words.map((w, n) => ({ label: w.word, correct: next[n], response: { pseudo: w.pseudo } })),
          meta: { threshold },
        }),
      });
      if (res.ok) setSaved(await res.json());
    }
  };

  if (!words.length) return <Alert>This word set is empty.</Alert>;
  if (done) {
    const score = marks.filter(Boolean).length;
    const met = score >= threshold;
    const missed = words.filter((_, n) => !marks[n]);
    return (
      <Card>
        <p className="text-sm text-muted">Score</p>
        <p className="text-[length:var(--font-size-2xl)] font-semibold">{score} / 40</p>
        <p className={`mt-1 font-medium ${met ? "text-success" : "text-warning"}`}>
          {met ? `At or above the threshold of ${threshold}.` : `${threshold - score} more needed to reach the threshold of ${threshold}.`}
        </p>
        <p className="mt-1 text-xs text-muted">
          {thresholdVerified ? "Threshold as published for this check." : `The threshold has been ${threshold} in every published year; this practice uses that value.`}
        </p>
        {missed.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium">Words to practise</p>
            <p className="text-sm">{missed.map((w) => `${w.word}${w.pseudo ? " 👾" : ""}`).join(", ")}</p>
          </div>
        )}
        {!saved && <p className="mt-2 text-xs text-muted">Saving…</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => {
              setI(0);
              setMarks([]);
              setSaved(null);
              started.current = new Date().toISOString();
            }}
          >
            Try again
          </Button>
          <Link href="/phonics" className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-border px-4 no-underline">
            Other word sets
          </Link>
        </div>
      </Card>
    );
  }
  const w = words[i];
  const newSection = i === 0 || words[i - 1].section !== w.section;
  return (
    <div>
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Section {w.section}</span>
          <span>
            Word {i + 1} of {words.length}
          </span>
        </div>
        <ProgressBar value={i} max={words.length} label="Words read" />
      </div>
      {newSection && i > 0 && <Alert>Section 2 starts here. These words are a bit harder.</Alert>}
      <Card>
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3">
          {w.pseudo && (
            <span className="text-4xl" role="img" aria-label="Alien: this is a made-up word">
              👾
            </span>
          )}
          <p className="select-none text-[3.2rem] font-semibold tracking-wide" style={{ fontFamily: "var(--font-sans)" }}>
            {w.word}
          </p>
          {w.pseudo && <p className="text-xs text-muted">Made-up word: read it using the sounds.</p>}
        </div>
        <p className="mb-2 text-center text-sm text-muted">Grown-up: did your child read it correctly?</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={() => void mark(false)} className="min-h-[56px]">
            ✗ Not yet
          </Button>
          <Button onClick={() => void mark(true)} className="min-h-[56px] !bg-success">
            ✓ Right
          </Button>
        </div>
      </Card>
    </div>
  );
}
