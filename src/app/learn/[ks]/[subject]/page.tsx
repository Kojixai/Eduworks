import Link from "next/link";
import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { keyStages, lessonCountsFor, statementsFor, subjects, unitsFor, yearGroups } from "@/lib/repo";
import { AttributionFooter, Badge, Card, CurriculumText, EmptyState, ListLink, Page, PageHeader } from "@/components/ui";

export default async function SubjectPage({ params, searchParams }: { params: Promise<{ ks: string; subject: string }>; searchParams: Promise<{ year?: string; view?: string }> }) {
  await requireChild();
  const { ks, subject } = await params;
  const sp = await searchParams;
  const subj = (await subjects()).find((s) => s.id === subject);
  const ksRow = (await keyStages()).find((k) => k.id === ks);
  if (!subj || !ksRow) notFound();
  const years = await yearGroups();
  const year = sp.year ?? null;
  const view = sp.view === "curriculum" ? "curriculum" : "units";
  const units = await unitsFor(subject, ks, year);
  const { rows, aims } = await statementsFor(subject, ks);
  const statements = rows.filter((r) => (r.level === "statement" || r.level === "strand" || r.level === "substrand") && (!year || r.level !== "statement" || !r.year_groups_json || r.year_groups_json.includes(`"${year}"`) || r.year_groups_json === "[]"));
  const counts = await lessonCountsFor(statements.filter((s) => s.level === "statement").map((s) => s.id));
  const overview = rows.find((r) => r.level === "overview");

  // Group statements: strand > sub-strand > statements
  const tree = new Map<string, Map<string, typeof statements>>();
  for (const s of statements.filter((s) => s.level === "statement")) {
    const strand = s.strand ?? "General";
    const sub = s.sub_strand ?? strand;
    if (!tree.has(strand)) tree.set(strand, new Map());
    const m = tree.get(strand)!;
    if (!m.has(sub)) m.set(sub, []);
    m.get(sub)!.push(s);
  }
  const byYear = new Map<string, typeof units>();
  for (const u of units) {
    const k = u.year_group_id ?? "other";
    if (!byYear.has(k)) byYear.set(k, []);
    byYear.get(k)!.push(u);
  }
  const tab = (v: string, label: string) => (
    <Link href={`/learn/${ks}/${subject}?view=${v}${year ? `&year=${year}` : ""}`} className={`inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm no-underline ${view === v ? "border-primary font-semibold text-ink" : "border-transparent text-muted"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <Page>
        <PageHeader
          title={`${subj.name} · ${ksRow.name}`}
          subtitle={year ? years.find((y) => y.id === year)?.name : "All years"}
          back={{ href: `/learn?ks=${ks}${year ? `&year=${year}` : ""}`, label: "Subjects" }}
        />
        <div className="mb-3 flex gap-1 border-b border-border">
          {tab("units", `Units (${units.length})`)}
          {tab("curriculum", "Curriculum")}
        </div>

        {view === "units" ? (
          units.length ? (
            [...byYear.entries()].map(([y, us]) => (
              <Card key={y} title={years.find((x) => x.id === y)?.name ?? "Other"} className="mb-3">
                {us.map((u) => (
                  <ListLink key={u.id} href={`/unit/${encodeURIComponent(u.id)}`} title={u.title} meta={[u.exam_board, u.tier].filter(Boolean).join(" · ") || undefined} />
                ))}
              </Card>
            ))
          ) : (
            <EmptyState title="No units for this selection yet." />
          )
        ) : (
          <>
            {overview && (
              <Card title="About this key stage" className="mb-3">
                <p className="whitespace-pre-line text-sm text-muted">
                  <CurriculumText text={overview.text} />
                </p>
              </Card>
            )}
            {[...tree.entries()].map(([strand, subs]) => (
              <Card key={strand} title={strand} className="mb-3">
                {[...subs.entries()].map(([sub, sts]) => (
                  <div key={sub} className="mb-2">
                    {sub !== strand && <h3 className="mt-2 text-sm font-semibold text-muted">{sub}</h3>}
                    {sts.map((s) => (
                      <ListLink
                        key={s.id}
                        href={`/statement/${encodeURIComponent(s.id)}`}
                        title={<CurriculumText text={s.text} />}
                        meta={
                          <>
                            {s.year_groups_json && JSON.parse(s.year_groups_json).length > 0 && <span className="mr-2">{(JSON.parse(s.year_groups_json) as string[]).map((y) => y.toUpperCase()).join(", ")}</span>}
                            {!s.statutory && <Badge tone="warning">non-statutory</Badge>}
                          </>
                        }
                        right={`${counts.get(s.id) ?? 0} lessons`}
                      />
                    ))}
                  </div>
                ))}
              </Card>
            ))}
            {aims.length > 0 && (
              <Card title="Aims of the programme of study">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {aims.map((a) => (
                    <li key={a.id}>
                      <CurriculumText text={a.text} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </Page>
      <AttributionFooter lines={view === "units" ? units.map((u) => u.attribution_text) : statements.slice(0, 1).map((s) => s.attribution_text)} />
    </>
  );
}
