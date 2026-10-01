import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { COVERAGE_GOOD, COVERAGE_OK, TONE_BG, coverageTone, fmtDate, param, pct } from "@/lib/admin";
import { keyStages } from "@/lib/repo";
import { Card, EmptyState, Grid, Page, PageHeader, Stat } from "@/components/ui";
import { Filters, TableWrap, n, td, th, type SP, ExportButton } from "../_ui";

export const metadata = { title: "Coverage" };

interface Cov {
  id: string;
  key_stage_id: string;
  subject_id: string;
  strand: string;
  statement_count: number;
  statements_with_lessons: number;
  statements_with_questions: number;
  lesson_count: number;
  question_count: number;
  public_question_count: number;
  gap_count: number;
  computed_at: string;
}

function PctCell({ v, of }: { v: number; of: number }) {
  const p = pct(v, of);
  return (
    <td className={`${td} text-right tabular-nums ${of ? TONE_BG[coverageTone(p)] : ""}`} title={`${v} of ${of}`}>
      {of ? `${p}%` : "–"}
    </td>
  );
}

export default async function CoveragePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const ks = param(sp.ks);
  const store = await getStore();
  const kss = await keyStages();
  const rows = await store.select<Cov>("coverage_matrix", { where: ks ? { key_stage_id: ks } : {}, orderBy: [["key_stage_id", "asc"], ["subject_id", "asc"], ["strand", "asc"]] });
  const tot = rows.reduce(
    (a, r) => ({ st: a.st + r.statement_count, wl: a.wl + r.statements_with_lessons, wq: a.wq + r.statements_with_questions, gaps: a.gaps + r.gap_count }),
    { st: 0, wl: 0, wq: 0, gaps: 0 },
  );

  return (
    <Page>
      <PageHeader title="Coverage" subtitle={`Computed ${fmtDate(rows[0]?.computed_at)}`} actions={<ExportButton table="coverage_matrix" format="csv">Export CSV</ExportButton>} />
      <Filters path="/admin/coverage" sp={sp} defs={[{ name: "ks", label: "Key stage", any: "All", options: kss.map((k) => [k.id, k.name]) }]} />
      <Grid cols={4}>
        <Stat label="Statements" value={n(tot.st)} />
        <Stat label="With lessons" value={`${pct(tot.wl, tot.st)}%`} />
        <Stat label="With questions" value={`${pct(tot.wq, tot.st)}%`} />
        <Stat label="Gaps" value={n(tot.gaps)} hint="no lesson or question" />
      </Grid>
      <div className="mt-4">
        <Card>
          <p className="mb-2 flex flex-wrap gap-2 text-xs text-muted">
            <span className={`rounded-[var(--radius-sm)] px-2 ${TONE_BG.success}`}>≥ {COVERAGE_GOOD}%</span>
            <span className={`rounded-[var(--radius-sm)] px-2 ${TONE_BG.warning}`}>
              {COVERAGE_OK}–{COVERAGE_GOOD - 1}%
            </span>
            <span className={`rounded-[var(--radius-sm)] px-2 ${TONE_BG.danger}`}>&lt; {COVERAGE_OK}%</span>
          </p>
          {!rows.length ? (
            <EmptyState title="No coverage rows for this key stage." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>KS</th>
                  <th className={th}>Subject</th>
                  <th className={th}>Strand</th>
                  <th className={`${th} text-right`}>Statements</th>
                  <th className={`${th} text-right`}>% lessons</th>
                  <th className={`${th} text-right`}>% questions</th>
                  <th className={`${th} text-right`}>Lessons</th>
                  <th className={`${th} text-right`}>Questions</th>
                  <th className={`${th} text-right`}>Public Qs</th>
                  <th className={`${th} text-right`}>Gaps</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.key_stage_id.toUpperCase()}</td>
                    <td className={td}>{r.subject_id}</td>
                    <td className={td}>
                      <div className="w-48 whitespace-normal">{r.strand}</div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{n(r.statement_count)}</td>
                    <PctCell v={r.statements_with_lessons} of={r.statement_count} />
                    <PctCell v={r.statements_with_questions} of={r.statement_count} />
                    <td className={`${td} text-right tabular-nums`}>{n(r.lesson_count)}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(r.question_count)}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(r.public_question_count)}</td>
                    <td className={`${td} text-right tabular-nums ${r.gap_count ? TONE_BG.danger : ""}`}>{n(r.gap_count)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </Page>
  );
}
