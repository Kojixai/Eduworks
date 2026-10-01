import Link from "next/link";
import { requireParentArea } from "@/lib/auth";
import { loadLearner } from "@/lib/learner-data";
import { buildDashboard, PERIODS, type Period } from "@/lib/dashboard";
import { recommend } from "@/lib/recommend";
import { BarChart, Ring, TrendChart } from "@/components/charts";
import { DashShell } from "@/components/shell/DashShell";
import { Recommended } from "@/components/shell/Recommended";
import { EmptyState } from "@/components/ui";
import { avatarFor } from "@/practice/accounts";
import { daysLeft } from "@/practice/mastery";

export const metadata = { title: "Dashboard" };

const card = "rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-5";
const h2 = "m-0 mb-3 font-[family-name:var(--font-head)] text-xl";
const band = (v: number) => (v < 60 ? "var(--coral)" : v < 80 ? "var(--gold)" : "var(--aqua)");

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ child?: string; period?: string }> }) {
  const parent = await requireParentArea("/dashboard");
  const sp = await searchParams;
  const period = (PERIODS.find((p) => String(p) === sp.period) ?? 7) as Period;
  const ctx = await loadLearner(parent, sp.child);

  if (!ctx)
    return (
      <DashShell view="parent" active="home">
        <h1 className="m-0 mb-3 text-[2rem]">Dashboard</h1>
        <EmptyState title="Add a learner to see their progress."><Link href="/home">Add a learner</Link></EmptyState>
      </DashShell>
    );

  const { learner, kids } = ctx;
  const d = buildDashboard({ period, books: ctx.books, unlocked: ctx.owned, sessions: ctx.sessions, practiceAttempts: ctx.practiceAttempts, curriculum: ctx.curriculum });
  const rec = recommend({ books: ctx.books, owned: ctx.owned, sessions: ctx.sessions });
  const av = avatarFor(learner.avatar);
  const link = (extra: Record<string, string>) => `/dashboard?${new URLSearchParams({ ...(ctx.isSample ? {} : { child: learner.id }), period: String(period), ...extra })}`;
  const secureTotal = d.books.reduce((n, b) => n + b.secure, 0);
  const delta = d.totals.questions - d.totals.prevQuestions;
  const weakest = d.sections.filter((s) => s.avgBest !== null).sort((a, b) => a.avgBest! - b.avgBest!).slice(0, 6);
  const notStarted = d.sections.filter((s) => s.avgBest === null).slice(0, Math.max(0, 6 - weakest.length));

  return (
    <DashShell view="parent" active="home" isAdmin={!!parent.is_admin} aside={<Recommended items={rec.items} struggling={rec.struggling} />}>
      {ctx.isSample && (
        <p role="note" className="mb-4 rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--ink)] bg-[var(--gold)]/40 px-4 py-2.5 text-sm">
          <b>Sample data.</b> You are previewing the parent view as an admin and have no learners of your own, so this shows a made-up learner.
        </p>
      )}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-full border-[1.5px] border-[var(--ink)] font-[family-name:var(--font-head)] text-2xl" style={{ background: av.bg, color: av.fg }}>{learner.first_name[0]}</span>
          <div>
            <h1 className="m-0 text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-tight">{learner.first_name}&apos;s dashboard</h1>
            <p className="m-0 text-sm text-muted">What {learner.first_name.split(" ")[0]} has been practising, and what to do next.</p>
          </div>
        </div>
        <nav aria-label="Time period" className="inline-flex rounded-full border-[1.5px] border-[var(--ink)] bg-surface p-[3px] text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={link({ period: String(p) })} aria-current={p === period ? "page" : undefined} className={`min-h-[40px] rounded-full px-4 py-2 font-medium no-underline ${p === period ? "bg-[var(--violet)] text-[var(--ink)]" : "text-[var(--ink)]"}`}>{p} days</Link>
          ))}
        </nav>
      </header>

      {kids.length > 1 && (
        <nav aria-label="Learner" className="mb-5 flex flex-wrap gap-2">
          {kids.map((k) => (
            <Link key={k.id} href={`/dashboard?child=${k.id}&period=${period}`} aria-current={k.id === learner.id ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-[var(--ink)] px-4 text-sm font-medium no-underline ${k.id === learner.id ? "bg-[var(--violet)]" : "bg-surface"} text-[var(--ink)]`}>{k.first_name}</Link>
          ))}
        </nav>
      )}

      {!d.hasAnything ? (
        <EmptyState title={`${learner.first_name} has not practised yet.`}>Scores, topics and trends appear here after the first practice. <Link href="/books">Choose a book</Link>.</EmptyState>
      ) : (
        <div className="grid gap-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile label="Days practised" value={`${d.totals.activeDays}`} hint={`of the last ${period}`} chip="var(--violet)" />
            <Tile label="Questions answered" value={d.totals.questions.toLocaleString("en-GB")} hint={d.totals.prevQuestions > 0 ? `${delta >= 0 ? "+" : ""}${delta} on the ${period} days before` : `in the last ${period} days`} chip="var(--gold)" />
            <Tile label="Score on first go" value={d.totals.accuracy === null ? "–" : `${d.totals.accuracy}%`} hint="across all practices" chip="var(--orange)" />
            <Tile label="Topics secure" value={`${secureTotal}`} hint="80% or more on 2 days" chip="var(--aqua)" />
          </section>

          {d.books.length > 0 && (
            <section aria-labelledby="h-books">
              <h2 id="h-books" className={h2}>Books</h2>
              <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
                {d.books.map((b) => {
                  const left = daysLeft(ctx.access.find((a) => a.bookId === b.bookId)!.expiresAt);
                  const due = d.focus.find((f) => f.bookId === b.bookId && f.reason === "due");
                  return (
                    <li key={b.bookId} className={`${card} flex flex-col gap-4`}>
                      <div className="flex items-center gap-4">
                        <Ring value={b.total ? b.secure / b.total : 0} size={104} label={`${b.secure} of ${b.total} topics secure`} colour="var(--chart-2)" />
                        <div className="min-w-0">
                          <p className="m-0 font-[family-name:var(--font-head)] text-lg leading-snug">{b.title}</p>
                          <p className="m-0 mt-1 text-sm text-muted">{b.secure}/{b.total} secure · {b.started} started</p>
                          <p className="m-0 text-xs text-muted">{left > 3000 ? "Preview access" : `${left} day${left === 1 ? "" : "s"} of access left`}</p>
                        </div>
                      </div>
                      <div className="mt-auto flex gap-2">
                        <Link href={`/books/${b.bookId}`} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--aqua)] px-4 font-semibold text-[var(--ink)] no-underline">Continue</Link>
                        {due && <Link href={`/books/${due.bookId}/${due.unitId}`} className="inline-flex min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-[var(--ink)] bg-surface px-4 font-semibold text-[var(--ink)] no-underline">Review</Link>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className={card} aria-labelledby="h-skill">
            <h2 id="h-skill" className={h2}>Skill progress</h2>
            <p className="mb-4 mt-0 text-sm text-muted">Average best score on the topics started in each area, weakest first.</p>
            <ul className="m-0 grid list-none gap-4 p-0">
              {weakest.map((s) => (
                <li key={s.bookId + s.sectionId}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="font-medium">{s.name} <span className="text-xs font-normal text-muted">· {s.bookTitle}</span></span>
                    <b>{s.avgBest}%</b>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[var(--chart-track)]" role="img" aria-label={`${s.name}: average ${s.avgBest} percent, ${s.started} of ${s.total} topics started`}>
                    <div className="h-full rounded-full" style={{ width: `${s.avgBest}%`, background: band(s.avgBest!) }} />
                  </div>
                  <p className="m-0 mt-1 text-xs text-muted">{s.started} of {s.total} topics started · {s.secure} secure</p>
                </li>
              ))}
              {notStarted.map((s) => (
                <li key={s.bookId + s.sectionId} className="text-sm text-muted">{s.name} <span className="text-xs">· {s.bookTitle} · not started ({s.total} topics)</span></li>
              ))}
            </ul>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <section className={card} aria-labelledby="h-activity">
              <h2 id="h-activity" className={h2}>Questions answered each day</h2>
              <BarChart data={d.daily} label={`Questions answered per day over the last ${d.daily.length} days`} />
            </section>
            <section className={card} aria-labelledby="h-trend">
              <h2 id="h-trend" className={h2}>Scores over time</h2>
              <TrendChart data={d.trend} label="Score on each practice, oldest to newest" />
            </section>
          </div>

          <section className={card} aria-labelledby="h-recent">
            <h2 id="h-recent" className={h2}>Recent practice</h2>
            <ul className="m-0 grid list-none gap-1 p-0">
              {d.recent.map((r, i) => (
                <li key={i} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[var(--color-border)] py-1.5 last:border-0">
                  <span><span className="block font-medium">{r.title}</span><span className="block text-xs text-muted">{new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {r.detail}</span></span>
                  <b className={`shrink-0 ${r.pct >= 80 ? "text-success" : ""}`}>{r.pct}%</b>
                </li>
              ))}
            </ul>
          </section>

          <p className="m-0 text-sm text-muted">
            Days practised shows how often, not how well: a topic is only <i>secure</i> after 80% or more on two different days. <Link href={`/progress${ctx.isSample ? "" : `?child=${learner.id}`}`}>Curriculum breakdown by statement</Link>.
          </p>
        </div>
      )}
    </DashShell>
  );
}

function Tile({ label, value, hint, chip }: { label: string; value: string; hint?: string; chip: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-4">
      <span className="mb-3 block h-2.5 w-10 rounded-full border border-[var(--ink)]" style={{ background: chip }} aria-hidden />
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-[family-name:var(--font-head)] text-[2.2rem] leading-none">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
