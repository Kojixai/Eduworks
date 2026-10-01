import Link from "next/link";
import { redirect } from "next/navigation";
import { currentParent } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { Card, Grid, Page, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Overview" };

/**
 * Read-only summary used by the "Admin" view while the site is in preview mode. It shows totals only: the real back office
 * (which holds names, emails and approvals) needs an admin login.
 */
export default async function Overview() {
  const p = await currentParent();
  if (!p) redirect("/login");
  if (p.is_admin) redirect("/admin");
  if (!p.is_preview) redirect("/home");
  const store = await getStore();
  const [books, topics, qs, statements, lessons, papers] = await Promise.all([
    store.count("practice_books"), store.count("practice_units"), store.count("questions"),
    store.count("curriculum_statements", { level: "statement" }), store.count("lessons"), store.count("papers"),
  ]);
  const inkQuestions = (await store.select<{ question_count: number }>("practice_units", { columns: ["question_count"] })).reduce((n, u) => n + u.question_count, 0);
  const f = (n: number) => n.toLocaleString("en-GB");
  return (
    <Page>
      <PageHeader title="Back office overview" subtitle="A read-only summary of what is on the site." />
      <p role="note" className="mb-4 rounded-[var(--radius-md)] border-[1.5px] border-dashed border-[var(--ink)] bg-[var(--c-amber)]/40 px-4 py-2.5 text-sm">
        You are in preview mode, so you see totals only. The full back office (review queue, sources, redemptions) needs an admin login.
      </p>
      <Grid cols={4}>
        <Stat label="Books" value={f(books)} hint={`${f(topics)} topics`} />
        <Stat label="Book practice questions" value={f(inkQuestions)} />
        <Stat label="Curriculum statements" value={f(statements)} />
        <Stat label="Lessons" value={f(lessons)} />
      </Grid>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Curriculum practice"><p className="m-0 text-sm text-muted">{f(qs)} questions and {f(papers)} papers, quizzes, phonics and times tables checks, all matched to the National Curriculum.</p></Card>
        <Card title="Look around"><p className="m-0 text-sm"><Link href="/dashboard">Parent dashboard</Link> · <Link href="/me">Child home</Link> · <Link href="/books">Books</Link> · <Link href="/learn">Curriculum</Link></p></Card>
      </div>
    </Page>
  );
}
