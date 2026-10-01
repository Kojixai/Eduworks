import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBook, getUnitContent } from "@/lib/practice";
import { getStore } from "@/lib/db";
import { gateFor } from "../../../access";
import { sectionVars } from "@/practice/colour";
import { answerText, describeResponse } from "@/practice/marking";
import { Diagram } from "@/practice/components/Diagram";

export const metadata: Metadata = { title: "Mistakes", robots: { index: false } };

function Parts({ text }: { text: string }) {
  const parts = text.split("; ");
  if (parts.length < 2) return <>{text}</>;
  return <ul style={{ margin: 0, paddingLeft: 22 }}>{parts.map((p, i) => <li key={i}>{p}</li>)}</ul>;
}

export default async function MistakesPage({ params, searchParams }: { params: Promise<{ bookId: string; unitId: string }>; searchParams: Promise<{ s?: string }> }) {
  const { bookId, unitId } = await params;
  const { s } = await searchParams;
  const gate = await gateFor(bookId);
  if (gate.state !== "ok" || !gate.child) redirect(`/books/${bookId}/${unitId}`);
  const [b, content] = await Promise.all([getBook(bookId), getUnitContent(bookId, unitId)]);
  if (!b || !content) notFound();
  const store = await getStore();
  // only this learner's own session
  const attempts = s
    ? await store.select<{ question_id: string; correct: number; is_retry: number; response_json: string | null }>("practice_attempts", { where: { session_id: s, student_id: gate.child.id, is_retry: 0 } })
    : [];
  const missed = content.unit.questions
    .map((q, i) => ({ q, i, a: attempts.find((x) => x.question_id === q.id) }))
    .filter((x) => x.a && !x.a.correct);
  const sec = b.meta.sections.find((x) => x.id === content.unit.section);
  const primary = b.meta.keyStage === "KS1" || b.meta.keyStage === "KS2";
  return (
    <div className="pr" style={sectionVars(sec?.colour ?? "#2360A8") as React.CSSProperties}>
      <div className={`wrap wrap-narrow page stack player${primary ? " primary" : ""}`}>
        <p className="crumbs" style={{ margin: 0 }}><Link href={`/books/${bookId}/${unitId}`}>{content.unit.title}</Link> / Mistakes</p>
        <h1>Go over mistakes</h1>
        {missed.length === 0 ? <div className="notice notice-ok"><p>No mistakes to go over. Every question was right first time.</p></div>
          : <p className="muted">Read each one carefully. Seeing why an answer is right is one of the best ways to remember it.</p>}
        {missed.map(({ q, i, a }) => (
          <article key={q.id} className="card mistake-item">
            <div className="qhead">
              <span className="qnum" aria-hidden="true">{i + 1}</span>
              <div><h2 className="prompt" style={{ fontFamily: "var(--body)", fontSize: "1.1em" }}><span className="visually-hidden">Question {i + 1}. </span>{q.prompt}</h2></div>
            </div>
            {q.diagram && <Diagram spec={q.diagram} />}
            <dl style={{ margin: "16px 0 0" }}>
              <dt style={{ fontFamily: "var(--head)", fontWeight: 600, color: "var(--bad)" }}>Your answer</dt>
              <dd style={{ margin: "2px 0 12px" }}><Parts text={describeResponse(q, a!.response_json ? JSON.parse(a!.response_json) : null)} /></dd>
              <dt style={{ fontFamily: "var(--head)", fontWeight: 600, color: "var(--ok)" }}>{q.type === "extended" ? "Model answer" : "Right answer"}</dt>
              <dd style={{ margin: "2px 0 12px" }}>{q.type === "extended" ? answerText(q) : <Parts text={answerText(q)} />}</dd>
              <dt style={{ fontFamily: "var(--head)", fontWeight: 600 }}>Why</dt>
              <dd style={{ margin: "2px 0 0" }}>{q.explanation}</dd>
            </dl>
          </article>
        ))}
        <div className="row"><Link className="btn btn-section" href={`/books/${bookId}/${unitId}/practice`}>Practise again</Link><Link className="btn btn-quiet" href={`/books/${bookId}`}>Back to the book</Link></div>
      </div>
    </div>
  );
}
