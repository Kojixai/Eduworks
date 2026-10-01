import Link from "next/link";
import { requireParentArea, childrenOf, activeChild } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { accessFor, allBooks, sessionsFor } from "@/lib/practice";
import { buildDashboard, PERIODS, type CurriculumAttemptLite, type Period, type PracticeAttemptLite } from "@/lib/dashboard";
import { BarChart, MasteryBar, TrendChart } from "@/components/charts";
import { Badge, EmptyState, Page } from "@/components/ui";
import { avatarFor } from "@/practice/accounts";
import { daysLeft } from "@/practice/mastery";

export const metadata = { title: "Dashboard" };

const KIND: Record<string, string> = { practice: "Book practice", quiz: "Quiz", paper: "Paper", phonics: "Phonics", mtc: "Times tables" };
const card = "rounded-[var(--radius-lg)] border border-border bg-surface p-[var(--card-pad)] shadow-[var(--shadow-card)]";
const h2 = "m-0 mb-3 font-[family-name:var(--font-head)] text-[1.05rem] font-semibold";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ child?: string; period?: string }> }) {
  const parent = await requireParentArea("/dashboard");
  const kids = await childrenOf(parent.id);
  const sp = await searchParams;
  const child = kids.find((k) => k.id === sp.child) ?? (await activeChild(parent)) ?? kids[0];
  const period = (PERIODS.find((p) => String(p) === sp.period) ?? 7) as Period;

  if (!child)
    return (
      <Page>
        <h1 className="mb-3 text-[length:var(--font-size-2xl)]">Dashboard</h1>
        <EmptyState title="Add a learner to see their progress.">
          <Link href="/home">Add a learner</Link>
        </EmptyState>
      </Page>
    );

  const store = await getStore();
  const [books, access, sessions, practiceAttempts, curriculum] = await Promise.all([
    allBooks(true),
    accessFor(parent.id),
    sessionsFor([child.id]),
    store.select<PracticeAttemptLite>("practice_attempts", { where: { student_id: child.id }, columns: ["question_id", "book_id", "unit_id", "correct", "is_retry", "created_at"], orderBy: [["created_at", "desc"]], limit: 8000 }),
    store.select<CurriculumAttemptLite>("attempts", { where: { student_id: child.id }, columns: ["id", "kind", "title", "finished_at", "score", "max_score", "duration_seconds"], orderBy: [["started_at", "desc"]], limit: 600 }),
  ]);
  const unlocked = new Set(access.filter((a) => a.active).map((a) => a.bookId));
  const d = buildDashboard({ period, books, unlocked, sessions, practiceAttempts, curriculum });
  const av = avatarFor(child.avatar);
  const link = (extra: Record<string, string>) => `/dashboard?${new URLSearchParams({ child: child.id, period: String(period), ...extra })}`;
  const secureTotal = d.books.reduce((n, b) => n + b.secure, 0);
  const delta = d.totals.questions - d.totals.prevQuestions;

  return (
    <Page>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full font-[family-name:var(--font-head)] text-xl font-semibold" style={{ background: av.bg, color: av.fg }}>{child.first_name[0]}</span>
          <div>
            <h1 className="m-0 text-[length:var(--font-size-2xl)] leading-tight">{child.first_name}&apos;s dashboard</h1>
            <p className="m-0 text-sm text-muted">What {child.first_name} has been practising, and what to look at next.</p>
          </div>
        </div>
        <nav aria-label="Time period" className="inline-flex rounded-full border border-border bg-surface p-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={link({ period: String(p) })} aria-current={p === period ? "page" : undefined} className={`min-h-[40px] rounded-full px-4 py-2 no-underline ${p === period ? "bg-primary text-on-primary" : "text-[var(--color-text)]"}`}>
              {p} days
            </Link>
          ))}
        </nav>
      </header>

      {kids.length > 1 && (
        <nav aria-label="Learner" className="mb-4 flex flex-wrap gap-2">
          {kids.map((k) => (
            <Link key={k.id} href={`/dashboard?child=${k.id}&period=${period}`} aria-current={k.id === child.id ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline ${k.id === child.id ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-[var(--color-text)]"}`}>
              {k.first_name}
            </Link>
          ))}
        </nav>
      )}

      {!d.hasAnything ? (
        <EmptyState title={`${child.first_name} has not practised yet.`}>
          Scores, topics and trends appear here after the first practice. <Link href="/books">Choose a book</Link> or <Link href="/learn">try the curriculum practice</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Days practised" value={`${d.totals.activeDays}`} hint={`of the last ${period}`} />
            <Tile label="Questions answered" value={d.totals.questions.toLocaleString("en-GB")} hint={d.totals.prevQuestions > 0 ? `${delta >= 0 ? "+" : ""}${delta} on the ${period} days before` : `in the last ${period} days`} />
            <Tile label="Score on first go" value={d.totals.accuracy === null ? "–" : `${d.totals.accuracy}%`} hint="across all practices" tone={d.totals.accuracy !== null && d.totals.accuracy >= 80 ? "good" : undefined} />
            <Tile label="Topics secure" value={`${secureTotal}`} hint="80% or more on 2 days" tone={secureTotal ? "good" : undefined} />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <section className={card} aria-labelledby="h-activity">
              <h2 id="h-activity" className={h2}>Questions answered each day</h2>
              <BarChart data={d.daily} label={`Questions answered per day over the last ${d.daily.length} days`} />
            </section>
            <section className={card} aria-labelledby="h-trend">
              <h2 id="h-trend" className={h2}>Scores over time</h2>
              <TrendChart data={d.trend} label="Score on each practice, oldest to newest" />
            </section>
          </div>

          {d.books.length > 0 && (
            <section className={card} aria-labelledby="h-books">
              <h2 id="h-books" className={h2}>Book by book</h2>
              <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2">
                {d.books.map((b) => {
                  const left = daysLeft(access.find((a) => a.bookId === b.bookId)!.expiresAt);
                  return (
                    <li key={b.bookId} className="border-l-4 pl-4" style={{ borderColor: b.colour }}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <Link href={`/books/${b.bookId}`} className="font-[family-name:var(--font-head)] font-semibold text-[var(--color-text)]">{b.title}</Link>
                        {b.due > 0 && <Badge tone="warning">{b.due} ready for another go</Badge>}
                      </div>
                      <MasteryBar {...b} />
                      <p className="m-0 mt-2 text-xs text-muted">{b.started} of {b.total} topics started · access for another {left} day{left === 1 ? "" : "s"}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card} aria-labelledby="h-focus">
              <h2 id="h-focus" className={h2}>Worth another go</h2>
              {d.focus.length === 0 ? (
                <p className="m-0 text-sm text-muted">Nothing needs revisiting right now.</p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {d.focus.map((f) => (
                    <li key={f.unitId}>
                      <Link href={`/books/${f.bookId}/${f.unitId}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--color-text)] no-underline hover:bg-bg">
                        <span><span className="block font-medium">{f.title}</span><span className="block text-xs text-muted">{f.bookTitle}</span></span>
                        <span className="shrink-0 text-right text-xs text-muted"><b className="block text-sm text-[var(--color-text)]">{f.bestPct}%</b>{f.reason === "due" ? "ready again" : "best so far"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={card} aria-labelledby="h-recent">
              <h2 id="h-recent" className={h2}>Recent practice</h2>
              <ul className="m-0 grid list-none gap-1 p-0">
                {d.recent.map((r, i) => (
                  <li key={i} className="flex min-h-[48px] items-center justify-between gap-3 px-2 py-1.5">
                    <span><span className="block font-medium">{r.title}</span><span className="block text-xs text-muted">{KIND[r.kind]} · {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {r.detail}</span></span>
                    <b className={`shrink-0 ${r.pct >= 80 ? "text-success" : ""}`}>{r.pct}%</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="m-0 text-sm text-muted">
            Days practised shows how often, not how well: a topic is only <i>secure</i> after 80% or more on two different days. <Link href={`/progress?child=${child.id}`}>Curriculum breakdown by statement</Link>.
          </p>
        </div>
      )}
    </Page>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-[family-name:var(--font-head)] text-[2rem] font-semibold leading-none ${tone === "good" ? "text-success" : ""}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
