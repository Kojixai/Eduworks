import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { lessonsForStatement, statement } from "@/lib/repo";
import { AttributionFooter, Badge, Card, CurriculumText, EmptyState, ListLink, Page, PageHeader } from "@/components/ui";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireChild();
  const { id } = await params;
  const s = await statement(decodeURIComponent(id));
  if (!s) notFound();
  const lessons = await lessonsForStatement(s.id);
  return (
    <>
      <Page>
        <PageHeader
          title="Curriculum statement"
          subtitle={[s.strand, s.sub_strand !== s.strand ? s.sub_strand : null].filter(Boolean).join(" › ")}
          back={{ href: `/learn/${s.key_stage_id}/${s.subject_id}?view=curriculum`, label: "Curriculum" }}
        />
        <Card className="mb-3">
          <p className="text-[length:var(--font-size-lg)]">
            <CurriculumText text={s.text} />
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {s.statutory ? <Badge tone="primary">statutory</Badge> : <Badge tone="warning">non-statutory</Badge>}
            {s.year_groups_json && (JSON.parse(s.year_groups_json) as string[]).map((y) => <Badge key={y}>{y.toUpperCase()}</Badge>)}
          </div>
        </Card>
        <Card title={`Lessons that teach this (${lessons.length})`}>
          {lessons.length ? (
            lessons.map((l) => (
              <ListLink
                key={l.lesson_id}
                href={`/lesson/${encodeURIComponent(l.lesson_id)}`}
                title={l.lesson.title}
                meta={l.method === "reasoned" ? <Badge tone="warning">suggested match</Badge> : undefined}
              />
            ))
          ) : (
            <EmptyState title="No lessons linked yet." />
          )}
        </Card>
      </Page>
      <AttributionFooter lines={[s.attribution_text, lessons[0]?.lesson.attribution_text]} />
    </>
  );
}
