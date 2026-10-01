import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, sessionsFor } from "@/lib/practice";
import { ChooseLearner, GateNotice, gateFor } from "../access";
import { sectionVars } from "@/practice/colour";
import { formatPages } from "@/practice/format";
import { groupByUnit, localDay, unitStatus } from "@/practice/mastery";
import { ProgressRing } from "@/practice/components/ProgressRing";
import { GrownUpNote } from "@/practice/components/GrownUpNote";

type P = { params: Promise<{ bookId: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const b = await getBook((await params).bookId);
  return { title: b ? b.meta.title : "Book" };
}

export default async function BookPage({ params }: P) {
  const { bookId } = await params;
  const [b, gate] = await Promise.all([getBook(bookId), gateFor(bookId)]);
  if (!b) notFound();
  const ok = gate.state === "ok";
  const child = ok ? gate.child : null;
  const byUnit = groupByUnit(child ? await sessionsFor([child.id], { bookId }) : []);
  const today = localDay();
  return (
    <div className="pr">
      <div className="book-head">
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb"><Link href="/books">Books</Link> / <span aria-current="page">{b.meta.title}</span></nav>
          <h1>{b.meta.title}</h1>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill">{b.meta.keyStage}</span><span className="pill">{b.meta.year}</span><span className="pill">{b.meta.subject}</span><span className="pill">{b.units.length} topics</span>
          </div>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 64 }}>
        <div style={{ marginTop: 24 }}>
          {!ok && <GateNotice gate={gate} here={`/books/${bookId}`} />}
          {ok && !child && <ChooseLearner next={`/books/${bookId}`} />}
          {ok && child && <GrownUpNote name={child.first_name} />}
        </div>
        {b.meta.sections.map((sec) => {
          const units = b.units.filter((u) => u.section === sec.id);
          if (!units.length) return null;
          return (
            <section key={sec.id} className="section-block" style={sectionVars(sec.colour) as React.CSSProperties} aria-labelledby={`sec-${sec.id}`}>
              <div className="section-title"><span className="swatch" aria-hidden="true" /><h2 id={`sec-${sec.id}`}>{sec.name}</h2></div>
              <ul className="unit-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {units.map((u) => {
                  const st = unitStatus(byUnit.get(u.id) ?? [], today);
                  return (
                    <li key={u.id}>
                      <Link href={`/books/${bookId}/${u.id}`} className="card card-link unit-card" data-testid={`unit-${u.id}`}>
                        {child && <ProgressRing status={st} />}
                        <div style={{ minWidth: 0 }}>
                          <h3>{u.title}</h3>
                          <span className="meta">
                            <span>Book page{u.bookPages.length > 1 ? "s" : ""} {formatPages(u.bookPages)}</span>
                            {child && st.state === "secure" && <span className="pill pill-ok">Secure</span>}
                            {child && st.due && <span className="pill">Ready for another go</span>}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
