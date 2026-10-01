import Link from "next/link";
import { requireParentArea, childrenOf, activeChild } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { scoresByRef, scoresByStatement, weakAreas, pct, type AttemptLite, type ResultLite } from "@/lib/progress";
import { Badge, Card, CurriculumText, EmptyState, Grid, Page, PageHeader, ProgressBar, Stat } from "@/components/ui";

export const metadata = { title: "Progress" };

const KIND: Record<string, string> = { quiz: "Quiz", paper: "Paper", phonics: "Phonics", mtc: "Times tables" };

export default async function Progress({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const parent = await requireParentArea("/progress");
  const kids = await childrenOf(parent.id);
  const sp = await searchParams;
  const child = kids.find((k) => k.id === sp.child) ?? (await activeChild(parent)) ?? kids[0];
  if (!child)
    return (
      <Page narrow>
        <PageHeader title="Progress" />
        <EmptyState title="Add a child first.">
          <Link href="/home">Add a child</Link>
        </EmptyState>
      </Page>
    );

  const store = await getStore();
  const attempts = await store.select<AttemptLite>("attempts", { where: { student_id: child.id }, orderBy: [["started_at", "desc"]] });
  const results = attempts.length
    ? await store.select<ResultLite & { question_id: string | null }>("results", { where: { attempt_id: attempts.slice(0, 400).map((a) => a.id) }, columns: ["attempt_id", "marks_awarded", "max_marks", "statement_ids_json", "question_id"] })
    : [];
  const byStatement = scoresByStatement(results);
  const statements = byStatement.length
    ? await store.select<{ id: string; text: string; strand: string | null; sub_strand: string | null; subject_id: string; key_stage_id: string | null }>("curriculum_statements", {
        where: { id: byStatement.slice(0, 500).map((s) => s.key) },
        columns: ["id", "text", "strand", "sub_strand", "subject_id", "key_stage_id"],
      })
    : [];
  const stById = new Map(statements.map((s) => [s.id, s]));
  // topic = sub-strand, e.g. "Fractions" within Number
  const topics = new Map<string, { marks: number; max: number; subject: string }>();
  for (const s of byStatement) {
    const st = stById.get(s.key);
    if (!st) continue;
    const topic = `${st.subject_id}|${st.sub_strand ?? st.strand ?? "Other"}`;
    const t = topics.get(topic) ?? { marks: 0, max: 0, subject: st.subject_id };
    t.marks += s.marks;
    t.max += s.max;
    topics.set(topic, t);
  }
  const weak = weakAreas(byStatement).slice(0, 8);
  const refs = scoresByRef(attempts);
  const finished = attempts.filter((a) => a.finished_at);

  return (
    <Page>
      <PageHeader title={`${child.first_name}'s progress`} subtitle="Scores by topic, paper and curriculum statement." />
      {kids.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {kids.map((k) => (
            <Link key={k.id} href={`/progress?child=${k.id}`} className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm no-underline ${k.id === child.id ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-ink"}`}>
              {k.first_name}
            </Link>
          ))}
        </div>
      )}

      <Grid cols={4}>
        <Stat label="Days practised (last 7)" value={new Set(finished.filter((a) => Date.now() - Date.parse(a.finished_at!) < 7 * 864e5).map((a) => a.finished_at!.slice(0, 10))).size} />
        <Stat label="Activities" value={finished.length} />
        <Stat label="Best score" value={finished.length ? `${Math.max(...finished.map((a) => pct(a.score ?? 0, a.max_score ?? 0)))}%` : "–"} />
        <Stat label="Questions answered" value={results.length} />
      </Grid>

      {!finished.length ? (
        <div className="mt-4">
          <EmptyState title="No practice yet.">Scores appear here after the first quiz, paper, phonics or times tables session.</EmptyState>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <Card title="Areas to work on">
            {weak.length ? (
              <ul className="grid gap-2">
                {weak.map((w) => {
                  const st = stById.get(w.key);
                  return (
                    <li key={w.key} className="rounded-[var(--radius-md)] border border-border p-2">
                      <Link href={`/statement/${encodeURIComponent(w.key)}`} className="text-sm text-ink no-underline">
                        {st ? <CurriculumText text={st.text} /> : w.key}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <ProgressBar value={w.marks} max={w.max} tone="danger" label="Score" />
                        <span className="shrink-0 text-xs text-muted">{w.pct}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing stands out yet. Keep practising to build up the picture.</p>
            )}
          </Card>

          <Card title="By topic">
            <div className="grid gap-3">
              {[...topics.entries()]
                .sort((a, b) => a[1].marks / a[1].max - b[1].marks / b[1].max)
                .slice(0, 20)
                .map(([k, t]) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{k.split("|")[1]}</span>
                      <span className="text-muted">{pct(t.marks, t.max)}%</span>
                    </div>
                    <ProgressBar value={t.marks} max={t.max} tone={pct(t.marks, t.max) >= 80 ? "success" : pct(t.marks, t.max) >= 50 ? "primary" : "danger"} label={k.split("|")[1]} />
                  </div>
                ))}
            </div>
          </Card>

          <Card title="Papers and checks">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1">Activity</th>
                  <th>Best</th>
                  <th>Latest</th>
                  <th>Tries</th>
                </tr>
              </thead>
              <tbody>
                {refs.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="py-2 pr-2">
                      <Badge>{KIND[r.kind] ?? r.kind}</Badge> {r.title}
                    </td>
                    <td>{r.best}%</td>
                    <td>{r.latest}%</td>
                    <td>{r.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="By curriculum statement">
            <ul className="divide-y divide-border">
              {byStatement
                .sort((a, b) => a.pct - b.pct)
                .slice(0, 40)
                .map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">{stById.get(s.key) ? <CurriculumText text={stById.get(s.key)!.text} /> : s.key}</span>
                    <span className="shrink-0 text-muted">
                      {s.marks}/{s.max}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>

          <Card title="History">
            <ul className="divide-y divide-border">
              {finished.slice(0, 30).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <Badge>{KIND[a.kind] ?? a.kind}</Badge> {a.title}
                    <span className="block text-xs text-muted">{new Date(a.finished_at!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {a.score}/{a.max_score}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Page>
  );
}
