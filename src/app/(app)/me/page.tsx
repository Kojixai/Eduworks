import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { loadLearner } from "@/lib/learner-data";
import { recommend } from "@/lib/recommend";
import { buildDashboard } from "@/lib/dashboard";
import { DashShell } from "@/components/shell/DashShell";
import { Ring } from "@/components/charts";
import { avatarFor } from "@/practice/accounts";
import { GrownUpNote } from "@/practice/components/GrownUpNote";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "My practice" };

const KIND_CHIP: Record<string, string> = { review: "Try again", strengthen: "Good next step", next: "Up next" };
const CYCLE = ["var(--gold)", "var(--violet)", "var(--aqua)", "var(--orange)"];

/** Child home: friendly, one clear next step, no scores of other people, no streaks, no shop. */
export default async function Me() {
  const parent = await requireParent();
  const ctx = await loadLearner(parent);
  if (!ctx)
    return (
      <DashShell view="child" active="home" isAdmin={!!parent.is_admin}>
        <EmptyState title="Who is practising?"><Link href="/home">Choose a learner</Link></EmptyState>
      </DashShell>
    );
  const { learner } = ctx;
  const av = avatarFor(learner.avatar);
  // children never see teasers for books they do not have
  const rec = recommend({ books: ctx.books, owned: ctx.owned, sessions: ctx.sessions, limit: 6 }).items.filter((r) => r.kind !== "unlock");
  const d = buildDashboard({ period: 30, books: ctx.books, unlocked: ctx.owned, sessions: ctx.sessions, practiceAttempts: ctx.practiceAttempts, curriculum: ctx.curriculum });
  const name = learner.first_name.split(" ")[0];

  return (
    <DashShell view="child" active="home" isAdmin={!!parent.is_admin}>
      {ctx.isSample && <p role="note" className="mb-4 rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--ink)] bg-[var(--gold)]/40 px-4 py-2.5 text-sm"><b>Sample data.</b> You are previewing the child view as an admin, so this shows a made-up learner.</p>}
      <header className="mb-6 flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full border-[1.5px] border-[var(--ink)] font-[family-name:var(--font-head)] text-3xl" style={{ background: av.bg, color: av.fg }}>{name[0]}</span>
        <div>
          <h1 className="m-0 text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] leading-tight">Hi {name}!</h1>
          <p className="m-0 text-muted">{rec.length ? "Here is what to try today." : "Pick a book to start."}</p>
        </div>
      </header>

      <section aria-labelledby="today" className="mb-8">
        <h2 id="today" className="m-0 mb-3 font-[family-name:var(--font-head)] text-2xl">Today&apos;s practice</h2>
        {rec.length === 0 ? (
          <EmptyState title="Nothing picked yet.">Open one of your books and try a topic. Your next steps will show up here.</EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {rec.slice(0, 3).map((r, i) => (
              <li key={r.id}>
                <Link href={r.href} className="flex h-full min-h-[180px] flex-col justify-between gap-4 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] p-5 text-[var(--ink)] no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-y-1" style={{ background: CYCLE[i % CYCLE.length] }}>
                  <span className="w-fit rounded-full border border-[var(--ink)] bg-white/80 px-3 py-0.5 text-xs font-semibold">{KIND_CHIP[r.kind]}</span>
                  <span className="font-[family-name:var(--font-head)] text-[1.5rem] leading-tight">{r.title}</span>
                  <span className="text-sm">{r.bookTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rec.length > 3 && (
          <details className="mt-4"><summary className="inline-flex min-h-[44px] cursor-pointer items-center font-semibold underline">More ideas</summary>
            <ul className="m-0 mt-2 grid list-none gap-2 p-0">
              {rec.slice(3).map((r) => <li key={r.id}><Link href={r.href} className="block rounded-[var(--radius-md)] border border-[var(--ink)] bg-surface px-4 py-3 text-[var(--ink)] no-underline">{r.title} <span className="text-sm text-muted">· {r.bookTitle}</span></Link></li>)}
            </ul>
          </details>
        )}
      </section>

      {d.books.length > 0 && (
        <section aria-labelledby="mybooks">
          <h2 id="mybooks" className="m-0 mb-3 font-[family-name:var(--font-head)] text-2xl">My books</h2>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {d.books.map((b) => (
              <li key={b.bookId}>
                <Link href={`/books/${b.bookId}`} className="flex items-center gap-4 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-4 text-[var(--ink)] no-underline hover:bg-[var(--peach)]/50">
                  <Ring value={b.total ? b.secure / b.total : 0} size={84} label={`${b.secure} of ${b.total} topics secure`} />
                  <span><span className="block font-[family-name:var(--font-head)] text-lg leading-snug">{b.title}</span><span className="text-sm text-muted">{b.secure} of {b.total} topics secure</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GrownUpNote name={name} />
    </DashShell>
  );
}
