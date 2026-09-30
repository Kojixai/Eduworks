import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { countBy, countIn, param, safeJson } from "@/lib/admin";
import { keyStages, subjects as allSubjects, type Statement } from "@/lib/repo";
import { Alert, Badge, ButtonLink, Card, CurriculumText, EmptyState, Page, PageHeader } from "@/components/ui";
import { Filters, n, type SP } from "../_ui";

export const metadata = { title: "Curriculum" };

export default async function CurriculumPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const kss = await keyStages();
  const ks = param(sp.ks) ?? "ks2";
  const ksRow = kss.find((k) => k.id === ks);

  const inKs = await store.select<{ subject_id: string; framework: string }>("curriculum_statements", { where: { key_stage_id: ks, level: "statement" }, columns: ["subject_id", "framework"] });
  const subjCounts = countBy(inKs, (r) => r.subject_id);
  const subjList = (await allSubjects()).filter((s) => subjCounts.has(s.id));
  const subject = param(sp.subject) && subjCounts.has(param(sp.subject)!) ? param(sp.subject)! : (subjList[0]?.id ?? "");
  const frameworks = [...countBy(inKs.filter((r) => r.subject_id === subject), (r) => r.framework).entries()];
  const framework = param(sp.framework);

  const rows = subject
    ? await store.select<Statement>("curriculum_statements", {
        where: { key_stage_id: ks, subject_id: subject, level: "statement", ...(framework ? { framework } : {}) },
        orderBy: [["sort", "asc"]],
      })
    : [];
  const ids = rows.map((r) => r.id);
  const [unitC, lessonC, questionC] = await Promise.all([
    countIn(store, "unit_statement_links", "statement_id", ids),
    countIn(store, "lesson_statement_links", "statement_id", ids),
    countIn(store, "question_statement_links", "statement_id", ids),
  ]);

  // strand > sub-strand > statement
  const tree = new Map<string, Map<string, Statement[]>>();
  for (const r of rows) {
    const st = r.strand ?? "(no strand)";
    const sub = r.sub_strand ?? "";
    if (!tree.has(st)) tree.set(st, new Map());
    const m = tree.get(st)!;
    if (!m.has(sub)) m.set(sub, []);
    m.get(sub)!.push(r);
  }
  const sum = (list: Statement[], m: Map<string, number>) => list.reduce((s, r) => s + (m.get(r.id) ?? 0), 0);

  return (
    <Page>
      <PageHeader
        title="Curriculum"
        subtitle={`${rows.length} statements${subject ? ` · ${subjList.find((s) => s.id === subject)?.name ?? subject}` : ""} · ${ksRow?.name ?? ks}`}
        actions={<ButtonLink variant="secondary" href="/api/admin/export?table=curriculum_statements&format=csv">Export CSV</ButtonLink>}
      />
      <Filters
        path="/admin/curriculum"
        sp={{ ...sp, ks, subject }}
        defs={[
          { name: "ks", label: "Key stage", options: kss.map((k) => [k.id, k.name]) },
          { name: "subject", label: "Subject", options: subjList.map((s) => [s.id, `${s.name} (${subjCounts.get(s.id)})`]) },
          { name: "framework", label: "Framework", any: "All frameworks", options: frameworks.map(([f, c]) => [f, `${f} (${c})`]) },
        ]}
      />
      {ksRow?.content_policy && (
        <Alert tone="warning">
          <strong>{ksRow.name} content policy: </strong>
          {ksRow.content_policy}
        </Alert>
      )}
      {!rows.length ? (
        <EmptyState title="No statements for this selection.">{ks === "ks5" ? "KS5 holds structure only; statements appear once the DfE A level content is ingested." : "Try another key stage or subject."}</EmptyState>
      ) : (
        <div className="grid gap-3">
          {[...tree.entries()].map(([strand, subs]) => {
            const all = [...subs.values()].flat();
            return (
              <Card key={strand}>
                <details open={tree.size <= 3}>
                  <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{strand}</span>
                    <span className="text-xs text-muted">
                      {all.length} statements · {n(sum(all, unitC))} unit links · {n(sum(all, lessonC))} lesson links · {n(sum(all, questionC))} question links
                    </span>
                  </summary>
                  {[...subs.entries()].map(([sub, list]) => (
                    <div key={sub} className="mt-3">
                      {sub && <h3 className="mb-1 text-sm font-semibold text-muted">{sub}</h3>}
                      <ul className="divide-y divide-border">
                        {list.map((s) => {
                          const years = safeJson<string[]>(s.year_groups_json, s.year_group_id ? [s.year_group_id] : []);
                          return (
                            <li key={s.id} className="py-2 text-sm">
                              <p>
                                <CurriculumText text={s.text} />
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                                {s.ref && <code className="break-all text-muted">{s.ref}</code>}
                                {years.map((y) => (
                                  <Badge key={y}>{y.toUpperCase()}</Badge>
                                ))}
                                {s.statutory ? <Badge tone="primary">statutory</Badge> : <Badge>non-statutory</Badge>}
                                {s.framework !== "nc2014" && <Badge tone="warning">{s.framework}</Badge>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                                <span>{n(unitC.get(s.id))} units</span>
                                <span>{n(lessonC.get(s.id))} lessons</span>
                                <span>{n(questionC.get(s.id))} questions</span>
                              </div>
                              {s.notes && <p className="mt-1 text-xs text-muted">Note: {s.notes}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
