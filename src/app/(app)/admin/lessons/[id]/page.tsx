import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { countBy } from "@/lib/admin";
import type { Statement } from "@/lib/repo";
import { Badge, ButtonLink, Card, CurriculumText, Page, PageHeader } from "@/components/ui";
import { ExtLink, Facts, ProvenanceFacts, StatusBadge, TableWrap, td, th, type Provenance } from "../../_ui";

export const metadata = { title: "Lesson" };

type LessonFull = Provenance & {
  id: string;
  unit_id: string | null;
  slug: string | null;
  title: string;
  pupil_outcome: string | null;
  sort: number;
  external_id: string | null;
  external_url: string | null;
  has_quiz: number;
};

export default async function AdminLessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const store = await getStore();
  const l = await store.first<LessonFull>("lessons", { where: { id } });
  if (!l) notFound();

  const [blocks, assets, links, ul, questions, qTotal] = await Promise.all([
    store.select<{ id: string; kind: string; title: string | null; body: string; sort: number; attribution_text: string | null; third_party_flag: number }>("content_blocks", {
      where: { lesson_id: id },
      orderBy: [["kind", "asc"], ["sort", "asc"]],
    }),
    store.select<Provenance & { id: string; kind: string; title: string | null; url: string | null; local_path: string | null; mime: string | null }>("assets", { where: { lesson_id: id } }),
    store.select<{ statement_id: string; method: string; confidence: number; review_status: string }>("lesson_statement_links", { where: { lesson_id: id }, orderBy: [["confidence", "desc"]] }),
    store.select<{ unit_id: string; position: number }>("unit_lessons", { where: { lesson_id: id } }),
    store.select<{ id: string; quiz_kind: string; qtype: string; prompt_text: string; review_status: string; third_party_flag: number }>("questions", {
      where: { lesson_id: id },
      columns: ["id", "quiz_kind", "qtype", "prompt_text", "review_status", "third_party_flag"],
      orderBy: [["quiz_kind", "asc"], ["sort", "asc"]],
      limit: 100,
    }),
    store.count("questions", { lesson_id: id }),
  ]);
  const unitIds = [...new Set([...(l.unit_id ? [l.unit_id] : []), ...ul.map((u) => u.unit_id)])];
  const [units, statements] = await Promise.all([
    unitIds.length ? store.select<{ id: string; title: string; subject_id: string; key_stage_id: string | null; year_group_id: string | null }>("units", { where: { id: unitIds } }) : [],
    links.length ? store.select<Statement>("curriculum_statements", { where: { id: links.map((x) => x.statement_id) } }) : [],
  ]);
  const stById = new Map(statements.map((s) => [s.id, s]));
  const kinds = [...countBy(blocks, (b) => b.kind).keys()];

  return (
    <Page>
      <PageHeader
        title={l.title}
        subtitle={<code className="break-all">{l.id}</code>}
        back={{ href: "/admin/lessons", label: "Lessons" }}
        actions={<ButtonLink variant="secondary" href={`/admin/questions?lesson_id=${encodeURIComponent(l.id)}`}>Questions ({qTotal})</ButtonLink>}
      />
      <div className="grid grid-cols-1 gap-3">
        <Card title="Lesson">
          <Facts
            rows={[
              ["Pupil outcome", l.pupil_outcome ?? "–"],
              ["Units", units.length ? units.map((u) => `${u.title} (${u.subject_id}, ${u.key_stage_id ?? "–"}${u.year_group_id ? `, ${u.year_group_id.toUpperCase()}` : ""})`).join("; ") : "–"],
              ["Slug", l.slug ?? "–"],
              ["External", l.external_url ? <ExtLink href={l.external_url}>{l.external_id ?? l.external_url}</ExtLink> : (l.external_id ?? "–")],
              ["Has quiz", l.has_quiz ? "yes" : "no"],
            ]}
          />
        </Card>

        <Card title={`Content blocks (${blocks.length})`}>
          {kinds.length === 0 && <p className="text-sm text-muted">No content blocks.</p>}
          {kinds.map((k) => (
            <div key={k} className="mb-3">
              <h3 className="mb-1 text-sm font-semibold">
                {k} <span className="font-normal text-muted">({blocks.filter((b) => b.kind === k).length})</span>
              </h3>
              <ul className="grid gap-1">
                {blocks
                  .filter((b) => b.kind === k)
                  .map((b) => (
                    <li key={b.id} className="rounded-[var(--radius-sm)] bg-surface-muted p-2 text-sm">
                      {b.title && <span className="font-medium">{b.title}: </span>}
                      <span className="whitespace-pre-line">{b.body}</span>
                      {b.third_party_flag ? (
                        <span className="ml-1">
                          <Badge tone="danger">third-party</Badge>
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Card>

        <Card title={`Assets (${assets.length})`}>
          {assets.length ? (
            <ul className="divide-y divide-border text-sm">
              {assets.map((a) => (
                <li key={a.id} className="py-2">
                  <Badge>{a.kind}</Badge> {a.url ? <ExtLink href={a.url}>{a.title ?? a.url}</ExtLink> : (a.title ?? a.local_path ?? a.id)}
                  {a.third_party_flag ? (
                    <span className="ml-1">
                      <Badge tone="danger">third-party</Badge>
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted">
                    {a.source_id ?? "–"} · {a.licence_id ?? "–"} {a.mime ? `· ${a.mime}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No assets.</p>
          )}
        </Card>

        <Card title={`Statement links (${links.length})`}>
          {links.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Statement</th>
                  <th className={th}>Method</th>
                  <th className={`${th} text-right`}>Confidence</th>
                  <th className={th}>Review</th>
                </tr>
              </thead>
              <tbody>
                {links.map((k) => {
                  const s = stById.get(k.statement_id);
                  return (
                    <tr key={k.statement_id}>
                      <td className={td}>
                        <div className="w-64 sm:w-96">{s ? <CurriculumText text={s.text} /> : k.statement_id}</div>
                        {s && <span className="block text-xs text-muted">{[s.key_stage_id, s.subject_id, s.strand].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className={td}>{k.method}</td>
                      <td className={`${td} text-right`}>{k.confidence.toFixed(2)}</td>
                      <td className={td}>
                        <StatusBadge status={k.review_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-muted">No statement links.</p>
          )}
        </Card>

        <Card title={`Questions (${qTotal})`}>
          {questions.length ? (
            <ul className="divide-y divide-border text-sm">
              {questions.map((qq) => (
                <li key={qq.id} className="py-2">
                  <Link href={`/admin/questions/${encodeURIComponent(qq.id)}`} className="whitespace-pre-line">
                    {qq.prompt_text.slice(0, 160)}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge>{qq.quiz_kind}</Badge>
                    <Badge>{qq.qtype}</Badge>
                    <StatusBadge status={qq.review_status} />
                    {qq.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No questions.</p>
          )}
        </Card>

        <Card title="Provenance">
          <ProvenanceFacts p={l} />
        </Card>
      </div>
    </Page>
  );
}
