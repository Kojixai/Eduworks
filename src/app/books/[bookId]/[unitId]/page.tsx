import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, getUnitContent, hasBookAccess, sessionsFor } from "@/lib/practice";
import { ChooseLearner, GateNotice, gateFor } from "../../access";
import { sectionVars } from "@/practice/colour";
import { formatPages } from "@/practice/format";
import { localDay, pct, unitStatus } from "@/practice/mastery";
import { StatusText } from "@/practice/components/StatusText";
import { TextPanel } from "@/practice/components/TextPanel";
import { GrownUpNote } from "@/practice/components/GrownUpNote";

type P = { params: Promise<{ bookId: string; unitId: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { bookId, unitId } = await params;
  const u = (await getBook(bookId))?.units.find((x) => x.id === unitId);
  return { title: u ? u.title : "Topic" };
}

export default async function UnitPage({ params }: P) {
  const { bookId, unitId } = await params;
  const [b, gate] = await Promise.all([getBook(bookId), gateFor(bookId)]);
  const u = b?.units.find((x) => x.id === unitId);
  if (!b || !u) notFound();
  const sec = b.meta.sections.find((s) => s.id === u.section);
  const ok = gate.state === "ok";
  const child = ok ? gate.child : null;
  const sessions = child ? await sessionsFor([child.id], { bookId }) : [];
  const mine = sessions.filter((s) => s.unitId === unitId);
  const st = unitStatus(mine, localDay());
  const latest = [...mine].sort((a, c) => c.completedAt.localeCompare(a.completedAt));
  // the reading text is part of the paid practice: only sent to a visitor whose access is active
  const text = ok && u.hasText ? (await getUnitContent(bookId, unitId))?.text ?? null : null;
  const idx = b.units.findIndex((x) => x.id === unitId);

  return (
    <div className="pr" style={sectionVars(sec?.colour ?? "#2360A8") as React.CSSProperties}>
      <div className="book-head">
        <div className="wrap wrap-narrow">
          <nav className="crumbs" aria-label="Breadcrumb"><Link href="/books">Books</Link> / <Link href={`/books/${bookId}`}>{b.meta.title}</Link> / <span aria-current="page">{u.title}</span></nav>
          <span className="pill pill-section">{sec?.name}</span>
          <h1 style={{ marginTop: 10 }}>{u.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Matches book page{u.bookPages.length > 1 ? "s" : ""} {formatPages(u.bookPages)}. {u.questionCount} questions, about {Math.max(5, Math.round(u.questionCount * 1.2))} minutes.
          </p>
        </div>
      </div>
      <div className="wrap wrap-narrow page stack">
        {u.summary && <div className="key"><div className="key-label">Remember</div><p>{u.summary}</p></div>}
        {!ok && <GateNotice gate={gate} here={`/books/${bookId}/${unitId}`} />}
        {ok && (
          <>
            {text && (<><h2 style={{ marginTop: 12 }}>Read the text first</h2><TextPanel text={text} /></>)}
            <div className="card">
              {child ? (
                <>
                  <div className="spread" style={{ marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>{st.sessions ? "Practise again" : "Ready to practise?"}</h2>
                    <StatusText st={st} />
                  </div>
                  <p className="muted">
                    {st.state === "secure"
                      ? `${child.first_name} has this topic secure. Practising again keeps it fresh.`
                      : st.sessions
                        ? `Best score so far: ${Math.round(st.bestPct * 100)}%. Score 80% or more on 2 different days to make this topic secure.`
                        : "10 questions, one at a time. Each answer is marked straight away with an explanation."}
                  </p>
                  <Link className="btn btn-section" href={`/books/${bookId}/${unitId}/practice`} data-testid="start-practice">{st.sessions ? "Practise again" : "Start practice"}</Link>
                  <GrownUpNote name={child.first_name} />
                  {latest.length > 0 && (
                    <details className="disclose" style={{ marginTop: 12 }}>
                      <summary>Past scores</summary>
                      <ul style={{ paddingLeft: 20, margin: 0 }}>
                        {latest.slice(0, 8).map((s) => (
                          <li key={s.id}>{Math.round(pct(s) * 100)}% on {new Date(s.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} <Link href={`/books/${bookId}/${unitId}/mistakes?s=${s.id}`}>See answers</Link></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <ChooseLearner next={`/books/${bookId}/${unitId}`} />
              )}
            </div>
          </>
        )}
        <div className="spread">
          {idx > 0 ? <Link className="btn btn-quiet btn-small" href={`/books/${bookId}/${b.units[idx - 1].id}`}>← Previous topic</Link> : <span />}
          {idx < b.units.length - 1 && <Link className="btn btn-quiet btn-small" href={`/books/${bookId}/${b.units[idx + 1].id}`}>Next topic →</Link>}
        </div>
      </div>
    </div>
  );
}
