import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import type { Where } from "@/lib/db/store";
import { PAGE_SIZE, QTYPES, QUIZ_KINDS, REVIEW_STATUSES, hrefWith, pageOf, param } from "@/lib/admin";
import { keyStages, subjects, yearGroups } from "@/lib/repo";
import { Badge, Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { Filters, Pager, StatusBadge, n, type SP, ExportButton } from "../_ui";

export const metadata = { title: "Questions" };

const FILTER_COLS = ["key_stage_id", "subject_id", "year_group_id", "qtype", "quiz_kind", "source_id", "review_status", "paper_id", "lesson_id"] as const;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const [kss, subs, years, sources] = await Promise.all([keyStages(), subjects(), yearGroups(), store.select<{ id: string }>("sources", { columns: ["id"], orderBy: [["id", "asc"]] })]);
  const page = pageOf(sp.page);

  const where: Where = {};
  for (const c of FILTER_COLS) {
    const v = param(sp[c]);
    if (v) where[c] = v;
  }
  const tp = param(sp.third_party_flag);
  if (tp === "0" || tp === "1") where.third_party_flag = Number(tp);

  const { review_status: _rs, ...withoutStatus } = where;
  const [total, rows, ...statusCounts] = await Promise.all([
    store.count("questions", where),
    store.select<{ id: string; prompt_text: string; qtype: string; quiz_kind: string; key_stage_id: string | null; subject_id: string | null; year_group_id: string | null; review_status: string; third_party_flag: number; marks: number; source_id: string | null }>(
      "questions",
      {
        where,
        columns: ["id", "prompt_text", "qtype", "quiz_kind", "key_stage_id", "subject_id", "year_group_id", "review_status", "third_party_flag", "marks", "source_id"],
        orderBy: [["id", "asc"]],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
    ),
    ...REVIEW_STATUSES.map((rs) => store.count("questions", { ...withoutStatus, review_status: rs })),
  ]);
  const exportParams = { review_status: param(sp.review_status), key_stage_id: param(sp.key_stage_id), subject_id: param(sp.subject_id) };

  return (
    <Page>
      <PageHeader
        title="Questions"
        subtitle={`${n(total)} matching questions`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton table="questions" format="csv" params={exportParams}>
              CSV
            </ExportButton>
            <ExportButton table="questions" format="json" params={exportParams}>
              JSON
            </ExportButton>
          </div>
        }
      />
      <Filters
        path="/admin/questions"
        sp={sp}
        defs={[
          { name: "key_stage_id", label: "Key stage", any: "All", options: kss.map((k) => [k.id, k.name]) },
          { name: "subject_id", label: "Subject", any: "All", options: subs.map((s) => [s.id, s.name]) },
          { name: "year_group_id", label: "Year group", any: "All", options: years.map((y) => [y.id, y.name]) },
          { name: "qtype", label: "Type", any: "All", options: QTYPES.map((t) => [t, t]) },
          { name: "quiz_kind", label: "Quiz kind", any: "All", options: QUIZ_KINDS.map((t) => [t, t]) },
          { name: "source_id", label: "Source", any: "All", options: sources.map((s) => [s.id, s.id]) },
          { name: "review_status", label: "Review status", any: "All", options: REVIEW_STATUSES.map((t) => [t, t]) },
          { name: "third_party_flag", label: "Third party", any: "Either", options: [["0", "No"], ["1", "Yes"]] },
        ]}
      >
        {param(sp.paper_id) && <input type="hidden" name="paper_id" value={param(sp.paper_id)} />}
        {param(sp.lesson_id) && <input type="hidden" name="lesson_id" value={param(sp.lesson_id)} />}
      </Filters>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {REVIEW_STATUSES.map((rs, i) => (
          <Link key={rs} href={hrefWith("/admin/questions", sp, { review_status: rs, page: undefined })} className="no-underline">
            <StatusBadge status={rs} /> <span className="text-ink">{n(statusCounts[i])}</span>
          </Link>
        ))}
        {(param(sp.paper_id) || param(sp.lesson_id)) && (
          <Link href={hrefWith("/admin/questions", sp, { paper_id: undefined, lesson_id: undefined, page: undefined })}>
            Clear {param(sp.paper_id) ? `paper ${param(sp.paper_id)}` : `lesson ${param(sp.lesson_id)}`}
          </Link>
        )}
      </div>
      {!rows.length ? (
        <EmptyState title="No questions match these filters." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((q) => (
              <li key={q.id} className="py-2">
                <Link href={`/admin/questions/${encodeURIComponent(q.id)}`} className="line-clamp-3 whitespace-pre-line text-sm">
                  {q.prompt_text}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <StatusBadge status={q.review_status} />
                  {q.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
                  <Badge>{q.qtype}</Badge>
                  <Badge>{q.quiz_kind}</Badge>
                  <span>
                    {[q.key_stage_id, q.subject_id, q.year_group_id?.toUpperCase(), q.source_id].filter(Boolean).join(" · ")} · {q.marks} mark{q.marks === 1 ? "" : "s"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pager path="/admin/questions" sp={sp} page={page} total={total} size={PAGE_SIZE} />
    </Page>
  );
}
