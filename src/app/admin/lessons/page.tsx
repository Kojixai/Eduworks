import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import type { Where } from "@/lib/db/store";
import { PAGE_SIZE, pageOf, param } from "@/lib/admin";
import { keyStages, subjects, yearGroups } from "@/lib/repo";
import { Badge, Card, EmptyState, Input, Page, PageHeader } from "@/components/ui";
import { Filters, Pager, type SP } from "../_ui";

export const metadata = { title: "Lessons" };

interface LessonRow {
  id: string;
  unit_id: string | null;
  title: string;
  has_quiz: number;
  source_id: string | null;
  third_party_flag: number;
}

export default async function LessonsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const [kss, subs, years, sources] = await Promise.all([keyStages(), subjects(), yearGroups(), store.select<{ id: string }>("sources", { columns: ["id"], orderBy: [["id", "asc"]] })]);
  const ks = param(sp.ks);
  const subject = param(sp.subject);
  const year = param(sp.year);
  const source = param(sp.source);
  const hasQuiz = param(sp.has_quiz);
  const q = param(sp.q);
  const page = pageOf(sp.page);

  const where: Where = {};
  if (ks || subject || year) {
    const units = await store.select<{ id: string }>("units", {
      where: { ...(ks ? { key_stage_id: ks } : {}), ...(subject ? { subject_id: subject } : {}), ...(year ? { year_group_id: year } : {}) },
      columns: ["id"],
    });
    where.unit_id = units.map((u) => u.id);
  }
  if (source) where.source_id = source;
  if (hasQuiz === "1" || hasQuiz === "0") where.has_quiz = Number(hasQuiz);
  if (q) where.title = { op: "ilike", value: `%${q}%` };

  const [total, rows] = await Promise.all([
    store.count("lessons", where),
    store.select<LessonRow>("lessons", {
      where,
      columns: ["id", "unit_id", "title", "has_quiz", "source_id", "third_party_flag"],
      orderBy: [["title", "asc"], ["id", "asc"]],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean) as string[])];
  const units = unitIds.length
    ? await store.select<{ id: string; title: string; subject_id: string; key_stage_id: string | null; year_group_id: string | null }>("units", {
        where: { id: unitIds },
        columns: ["id", "title", "subject_id", "key_stage_id", "year_group_id"],
      })
    : [];
  const unitById = new Map(units.map((u) => [u.id, u]));

  return (
    <Page>
      <PageHeader title="Lessons" subtitle={`${total.toLocaleString("en-GB")} matching lessons`} />
      <Filters
        path="/admin/lessons"
        sp={sp}
        defs={[
          { name: "ks", label: "Key stage", any: "All", options: kss.map((k) => [k.id, k.name]) },
          { name: "subject", label: "Subject", any: "All", options: subs.map((s) => [s.id, s.name]) },
          { name: "year", label: "Year (via unit)", any: "All", options: years.map((y) => [y.id, y.name]) },
          { name: "source", label: "Source", any: "All", options: sources.map((s) => [s.id, s.id]) },
          { name: "has_quiz", label: "Has quiz", any: "Either", options: [["1", "Yes"], ["0", "No"]] },
        ]}
      >
        <label className="col-span-2 block min-w-0 text-xs text-muted sm:col-span-3">
          Title contains
          <Input name="q" defaultValue={q ?? ""} placeholder="e.g. fractions" className="mt-1 text-sm text-ink" />
        </label>
      </Filters>
      {!rows.length ? (
        <EmptyState title="No lessons match these filters." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((l) => {
              const u = l.unit_id ? unitById.get(l.unit_id) : undefined;
              return (
                <li key={l.id} className="py-2">
                  <Link href={`/admin/lessons/${encodeURIComponent(l.id)}`} className="font-medium">
                    {l.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                    {u && (
                      <span className="min-w-0">
                        {u.title} · {u.subject_id} · {u.key_stage_id ?? "–"}
                        {u.year_group_id ? ` · ${u.year_group_id.toUpperCase()}` : ""}
                      </span>
                    )}
                    <Badge>{l.source_id ?? "no source"}</Badge>
                    {l.has_quiz ? <Badge tone="primary">quiz</Badge> : null}
                    {l.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pager path="/admin/lessons" sp={sp} page={page} total={total} size={PAGE_SIZE} />
    </Page>
  );
}
