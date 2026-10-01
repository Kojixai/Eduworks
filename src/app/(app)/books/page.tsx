import Link from "next/link";
import { allBooks } from "@/lib/practice";
import { currentParent } from "@/lib/auth";
import { accessFor } from "@/lib/practice";
import { sectionVars } from "@/practice/colour";

export const metadata = { title: "Books with online practice" };

export default async function BooksPage() {
  const [books, parent] = await Promise.all([allBooks(true), currentParent()]);
  const mine = parent ? new Map((await accessFor(parent.id)).map((a) => [a.bookId, a])) : new Map();
  return (
    <div className="pr">
      <div className="book-head">
        <div className="wrap">
          <h1>Books with online practice</h1>
          <p className="lead" style={{ margin: 0 }}>Ten new questions for every page of the printed book, marked instantly with a worked explanation.</p>
        </div>
      </div>
      <div className="wrap" style={{ padding: "32px 20px 64px" }}>
        <ul className="grid grid-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {books.map((b) => {
            const a = mine.get(b.meta.id);
            return (
              <li key={b.meta.id}>
                <Link href={`/books/${b.meta.id}`} className="card card-link" style={{ ...(sectionVars(b.meta.sections[0]?.colour ?? "#2360A8") as React.CSSProperties), height: "100%" }}>
                  <h3 style={{ fontSize: "1.05rem" }}>{b.meta.title}</h3>
                  <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                    <span className="pill">{b.meta.keyStage}</span><span className="pill">{b.meta.year}</span><span className="pill">{b.meta.subject}</span>
                    {a?.active && <span className="pill pill-ok">Unlocked</span>}
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>{b.units.length} topics, {b.units.reduce((n, u) => n + u.questionCount, 0).toLocaleString("en-GB")} practice questions. Ages {b.meta.ageRange}.</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
