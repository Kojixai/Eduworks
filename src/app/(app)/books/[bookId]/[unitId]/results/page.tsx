import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBook, sessionsFor } from "@/lib/practice";
import { gateFor } from "../../../access";
import { sectionVars } from "@/practice/colour";
import { GrownUpNote } from "@/practice/components/GrownUpNote";
import { addDays, localDay, pct, unitStatus } from "@/practice/mastery";

export const metadata: Metadata = { title: "Results", robots: { index: false } };
const niceDay = (day: string) => new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ bookId: string; unitId: string }>; searchParams: Promise<{ s?: string; retried?: string }> }) {
  const { bookId, unitId } = await params;
  const sp = await searchParams;
  const gate = await gateFor(bookId);
  if (gate.state !== "ok" || !gate.child) redirect(`/books/${bookId}/${unitId}`);
  const child = gate.child;
  const b = await getBook(bookId);
  const u = b?.units.find((x) => x.id === unitId);
  if (!b || !u) notFound();
  const sessions = (await sessionsFor([child.id], { bookId })).filter((s) => s.unitId === unitId);
  const session = sessions.find((s) => s.id === sp.s) ?? [...sessions].sort((a, c) => c.completedAt.localeCompare(a.completedAt))[0];
  const sec = b.meta.sections.find((s) => s.id === u.section);
  if (!session)
    return (
      <div className="pr"><div className="wrap wrap-narrow page"><div className="card stack"><h1>No results yet</h1><Link className="btn btn-primary" href={`/books/${bookId}/${unitId}`}>Back to the topic</Link></div></div></div>
    );

  const p = Math.round(pct(session) * 100);
  const st = unitStatus(sessions, localDay());
  const justSecured = st.state === "secure" && unitStatus(sessions.filter((s) => s.id !== session.id)).state !== "secure";
  const wrong = session.questionCount - session.correctCount;
  const [rRight, rTotal] = sp.retried ? sp.retried.split("-").map(Number) : [0, 0];
  const next = niceDay(st.nextDueDay ?? addDays(localDay(), 1));
  let headline: string, message: string;
  if (justSecured) { headline = "This topic is now secure"; message = `${child.first_name} has scored 80% or more on 2 different days. Well done.`; }
  else if (st.state === "secure") { headline = "Still secure"; message = "This topic was already secure, and this practice kept it fresh."; }
  else if (p >= 80) { headline = "Great score"; message = `Score 80% or more again on another day to make this topic secure. It will be ready to try again on ${next}.`; }
  else if (p >= 50) { headline = "Good effort"; message = `Look back at the mistakes, then have another go on ${next}.`; }
  else { headline = "Keep going"; message = `This one needs more practice. Read the Remember box and the book page again, then try once more on ${next}.`; }

  return (
    <div className="pr" style={sectionVars(sec?.colour ?? "#2360A8") as React.CSSProperties}>
      <div className="wrap wrap-narrow page stack">
        <p className="crumbs" style={{ margin: 0 }}><Link href={`/books/${bookId}`}>{b.meta.title}</Link> / {u.title}</p>
        <div className="card score-hero">
          <h1 style={{ marginBottom: 4 }}>{headline}</h1>
          <div className="score-big" aria-label={`Score ${p} percent`}>{p}%</div>
          <p style={{ fontFamily: "var(--head)", fontWeight: 500 }}>{session.correctCount} out of {session.questionCount} questions right first time ({session.score} of {session.maxScore} marks)</p>
          <p className="muted" style={{ maxWidth: "34em", margin: "0 auto" }}>{message}</p>
          <GrownUpNote />
          {rTotal > 0 && <p className="small muted" style={{ marginTop: 12 }}>On the second go {rRight} of {rTotal} were right.</p>}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          {wrong > 0 && <Link className="btn btn-section" href={`/books/${bookId}/${unitId}/mistakes?s=${session.id}`} data-testid="mistakes-link">Go over mistakes</Link>}
          <Link className="btn btn-secondary" href={`/books/${bookId}/${unitId}/practice`}>Practise again</Link>
          <Link className="btn btn-quiet" href={`/books/${bookId}`}>Back to the book</Link>
        </div>
      </div>
    </div>
  );
}
