import Link from "next/link";
import { redirect } from "next/navigation";
import { currentParent } from "@/lib/auth";
import { allBooks } from "@/lib/practice";
import { sectionVars } from "@/practice/colour";
import { accessLength, ORDER_MODE } from "@/practice/config";

const FEATURES = [
  {
    title: "10 new questions for every topic",
    text: "Each page of the book has its own online practice: fresh questions on the same skill, so it is never the same as the printed page.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Marked straight away",
    text: "Every answer is checked as soon as it is given, with a short worked explanation. Longer written answers come with a model answer to mark against.",
    icon: "M5 13l4 4L19 7",
  },
  {
    title: "Progress you can see",
    text: "A topic counts as secure after 80% or more on 2 different days. Topics that need another look come back after 1, 3 and 7 days.",
    icon: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  },
  {
    title: "Built for families",
    text: "One adult account with a simple profile for each child. Children never need an email address, and there are no adverts or sharing buttons.",
    icon: "M16 11a4 4 0 1 0-8 0M3 21a9 9 0 0 1 18 0",
  },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await currentParent()) redirect("/home");
  const books = await allBooks(true);
  return (
    <div className="pr">
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="pill" style={{ marginBottom: 14 }}>Free with every Inkworks Press study book</p>
            <h1>Online practice that matches your book, page by page</h1>
            <p className="lead">
              Type in the code printed inside your book and get {accessLength()} of extra practice questions, marked instantly, with progress tracking for each child.
            </p>
            <div className="row cta">
              <Link href="/signup" className="btn btn-primary">Enter your book code</Link>
              <Link href="/login" className="btn btn-secondary">Log in</Link>
            </div>
          </div>
          <div className="book-mock" aria-hidden="true">
            <span className="mock-lines"><i style={{ width: "70%" }} /><i style={{ width: "90%" }} /><i style={{ width: "55%" }} /></span>
            <span className="mock-label">Inside the front cover</span>
            <div className="mock-box">
              <div className="small" style={{ fontFamily: "var(--head)", fontWeight: 600 }}>Your free online practice</div>
              <div className="mock-code">INK-ABCD-EFGH</div>
            </div>
            <span className="small muted">Your code is different from this example.</span>
            <span className="mock-lines"><i style={{ width: "85%" }} /><i style={{ width: "60%" }} /></span>
          </div>
        </div>
      </section>

      <section className="section-band" aria-labelledby="what">
        <div className="wrap">
          <h2 id="what">What you get</h2>
          <div className="grid grid-feat" style={{ marginTop: 20 }}>
            {FEATURES.map((f) => (
              <div className="card feature" key={f.title}>
                <div className="icon" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d={f.icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band" id="find-code" aria-labelledby="find">
        <div className="wrap grid grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2 id="find">How to find your code</h2>
            <ol className="steps" style={{ marginTop: 18 }}>
              <li><span>Open the front cover of your Inkworks Press book.</span></li>
              <li><span>Find the box headed <strong>Your free online practice</strong>. The code starts with INK.</span></li>
              {ORDER_MODE !== "off" && (
                <li><span>{ORDER_MODE === "optional" ? "If you have it to hand, find" : "Find"} your Amazon order number. It is in <strong>Your Orders</strong> on Amazon and in your order confirmation email, and looks like <span className="nowrap">203-1234567-1234567</span>.</span></li>
              )}
              <li><span>Choose <Link href="/signup">Enter your book code</Link>, then add the code and your details.</span></li>
            </ol>
          </div>
          <div className="card">
            <h3>Good to know</h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>A parent, guardian or teacher creates the account. Children use a simple profile picker with just a first name and year group, and never need an email address.</li>
              <li>Students aged 13 or over can create their own account for KS3 and GCSE books.</li>
              <li>Access lasts {accessLength()} from the day you enter the code.</li>
              <li>One account can hold several children and several books.</li>
              <li>Joining our mailing list is optional, for adults only, and the box starts unticked.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-band" aria-labelledby="books">
        <div className="wrap">
          <h2 id="books">Books with online practice</h2>
          {books.length === 0 ? (
            <p className="muted">Books will appear here soon.</p>
          ) : (
            <div className="grid grid-2" style={{ marginTop: 20 }}>
              {books.map((b) => (
                <Link
                  key={b.meta.id}
                  href={`/books/${b.meta.id}`}
                  className="card card-link book-card"
                  style={sectionVars(b.meta.sections[0]?.colour ?? "#2360A8") as React.CSSProperties}
                >
                  <span className="book-spine" aria-hidden="true" />
                  <span>
                    <h3>{b.meta.title}</h3>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="pill">{b.meta.keyStage}</span>
                      <span className="pill">{b.meta.year}</span>
                      <span className="pill">{b.meta.subject}</span>
                    </span>
                    <span className="muted small" style={{ display: "block", marginTop: 8 }}>
                      {b.units.length} topics, {b.units.reduce((n, u) => n + u.questionCount, 0).toLocaleString("en-GB")} practice questions. Ages {b.meta.ageRange}.
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="section-band" aria-labelledby="free">
        <div className="wrap">
          <h2 id="free">Free for everyone: the curriculum</h2>
          <p className="lead" style={{ marginTop: 8 }}>
            Beyond the books, every child gets free lessons, quizzes, timed practice papers, the phonics screening check and the times tables check, matched to the National Curriculum for Key Stages 1 to 4. Built from open data (Oak National Academy and the Standards and Testing Agency, under the Open Government Licence).
          </p>
          <div className="row"><Link href="/login" className="btn btn-secondary">Log in to start</Link><Link href="/credits" className="btn btn-quiet">Credits and licences</Link></div>
        </div>
      </section>
    </div>
  );
}
