import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { unit, yearGroups } from "@/lib/repo";
import { AttributionFooter, Badge, Card, CurriculumText, ListLink, Page, PageHeader } from "@/components/ui";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  await requireChild();
  const { id } = await params;
  const data = await unit(decodeURIComponent(id));
  if (!data) notFound();
  const { unit: u, lessons, blocks, statements } = data;
  const years = await yearGroups();
  const prior = blocks.filter((b) => b.kind === "prior_knowledge");
  const prereq = blocks.filter((b) => b.kind === "prerequisite_unit");
  return (
    <>
      <Page>
        <PageHeader
          title={u.title}
          subtitle={[years.find((y) => y.id === u.year_group_id)?.name, u.exam_board, u.tier].filter(Boolean).join(" · ")}
          back={{ href: `/learn/${u.key_stage_id}/${u.subject_id}${u.year_group_id ? `?year=${u.year_group_id}` : ""}`, label: "Units" }}
        />
        {u.description && (
          <Card className="mb-3">
            <p className="text-sm">{u.description}</p>
            {u.why_this_why_now && <p className="mt-2 text-sm text-muted">{u.why_this_why_now}</p>}
          </Card>
        )}
        <Card title={`Lessons (${lessons.length})`} className="mb-3">
          {lessons.map((l, i) => (
            <ListLink key={l.id} href={`/lesson/${encodeURIComponent(l.id)}`} title={`${i + 1}. ${l.title}`} meta={l.pupil_outcome ?? undefined} />
          ))}
        </Card>
        {(prior.length > 0 || prereq.length > 0) && (
          <Card title="Before this unit" className="mb-3">
            {prior.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {prior.map((p) => (
                  <li key={p.id}>{p.body}</li>
                ))}
              </ul>
            )}
            {prereq.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Builds on: {prereq.slice(0, 6).map((p) => p.title).join("; ")}
                {prereq.length > 6 ? "…" : ""}
              </p>
            )}
          </Card>
        )}
        {statements.length > 0 && (
          <Card title="National Curriculum links">
            {statements.map((s) => (
              <ListLink
                key={s.id}
                href={`/statement/${encodeURIComponent(s.id)}`}
                title={<CurriculumText text={s.text} />}
                meta={s.link.method === "reasoned" ? <Badge tone="warning">suggested link</Badge> : undefined}
              />
            ))}
          </Card>
        )}
      </Page>
      <AttributionFooter lines={[u.attribution_text, ...lessons.slice(0, 1).map((l) => l.attribution_text)]} />
    </>
  );
}
