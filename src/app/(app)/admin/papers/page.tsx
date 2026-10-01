import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { param, statsSummary } from "@/lib/admin";
import { keyStages } from "@/lib/repo";
import { Badge, ButtonLink, Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { ExtLink, Facts, Filters, StatusBadge, n, type SP, ExportButton } from "../_ui";

export const metadata = { title: "Papers" };

interface PaperRow {
  id: string;
  key_stage_id: string | null;
  subject_id: string | null;
  year: number | null;
  name: string;
  paper_code: string | null;
  kind: string;
  total_marks: number | null;
  time_allowed_minutes: number | null;
  question_count: number | null;
  paper_url: string | null;
  mark_scheme_url: string | null;
  validation_status: string;
  validation_json: string | null;
  review_status: string;
  source_id: string | null;
  licence_id: string | null;
  third_party_flag: number;
}

export default async function PapersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const ks = param(sp.ks);
  const vs = param(sp.validation_status);
  const kss = await keyStages();
  const papers = await store.select<PaperRow>("papers", {
    where: { ...(ks ? { key_stage_id: ks } : {}), ...(vs ? { validation_status: vs } : {}) },
    orderBy: [["key_stage_id", "asc"], ["year", "desc"], ["name", "asc"]],
  });
  const stats = await Promise.all(
    papers.map(async (p) => {
      const qs = await store.select<{ marks: number }>("questions", { where: { paper_id: p.id }, columns: ["marks"] });
      return { count: qs.length, marks: qs.reduce((s, q) => s + (q.marks ?? 0), 0) };
    }),
  );

  return (
    <Page>
      <PageHeader title="Papers" subtitle={`${papers.length} papers`} actions={<ExportButton table="papers" format="csv">Export CSV</ExportButton>} />
      <Filters
        path="/admin/papers"
        sp={sp}
        defs={[
          { name: "ks", label: "Key stage", any: "All", options: kss.map((k) => [k.id, k.name]) },
          { name: "validation_status", label: "Validation", any: "All", options: [["passed", "passed"], ["failed", "failed"], ["pending", "pending"]] },
        ]}
      />
      {!papers.length ? (
        <EmptyState title="No papers match." />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {papers.map((p, i) => {
            const st = stats[i];
            const countOk = p.question_count == null || p.question_count === st.count;
            const marksOk = p.total_marks == null || p.total_marks === st.marks;
            return (
              <Card key={p.id}>
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{p.name}</h2>
                    <p className="break-all text-xs text-muted">
                      {p.id} · {[p.key_stage_id, p.subject_id, p.year, p.kind].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={p.validation_status} />
                    <StatusBadge status={p.review_status} />
                    {p.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
                  </div>
                </div>
                <Facts
                  rows={[
                    ["Questions", <span key="q">{n(st.count)} in DB {p.question_count != null && <>· {p.question_count} declared {!countOk && <Badge tone="danger">mismatch</Badge>}</>}</span>],
                    ["Marks", <span key="m">{n(st.marks)} in DB {p.total_marks != null && <>· {p.total_marks} declared {!marksOk && <Badge tone="danger">mismatch</Badge>}</>}</span>],
                    ["Time allowed", p.time_allowed_minutes ? `${p.time_allowed_minutes} min` : "–"],
                    [
                      "Validation",
                      statsSummary(p.validation_json, 12).length ? (
                        <span key="v" className="flex flex-wrap gap-1">
                          {statsSummary(p.validation_json, 12).map(([k, v]) => (
                            <Badge key={k}>
                              {k}: {v}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        "–"
                      ),
                    ],
                    ["Source / licence", `${p.source_id ?? "–"} · ${p.licence_id ?? "–"}`],
                    ["Links", <span key="l" className="flex flex-wrap gap-x-3">{p.paper_url && <ExtLink href={p.paper_url}>paper</ExtLink>}{p.mark_scheme_url && <ExtLink href={p.mark_scheme_url}>mark scheme</ExtLink>}{!p.paper_url && !p.mark_scheme_url && "–"}</span>],
                  ]}
                />
                <div className="mt-3">
                  <ButtonLink variant="secondary" href={`/admin/questions?paper_id=${encodeURIComponent(p.id)}`}>
                    View {n(st.count)} questions
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Student view: <Link href="/papers">/papers</Link>
      </p>
    </Page>
  );
}
