import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { ATTRIBUTION_TABLES, attributionReport } from "@/lib/admin";
import { Badge, Card, Page, PageHeader } from "@/components/ui";
import { TableWrap, n, td, th } from "../_ui";

export const metadata = { title: "Attribution" };

const SHORT: Record<string, string> = {
  curriculum_statements: "Statements",
  units: "Units",
  lessons: "Lessons",
  content_blocks: "Blocks",
  questions: "Questions",
  papers: "Papers",
  phonics_words: "Phonics",
  assessment_rules: "Rules",
};

export default async function AttributionPage() {
  await requireAdmin();
  const { rows, perTable } = await attributionReport(await getStore());
  const tpTotal = perTable.reduce((s, t) => s + t.third_party, 0);

  return (
    <Page>
      <PageHeader title="Attribution" subtitle={`${rows.length} distinct attribution × source × licence combinations · ${n(tpTotal)} third-party records`} />
      <div className="grid grid-cols-1 gap-3">
        <Card title="By table">
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Table</th>
                <th className={`${th} text-right`}>Records</th>
                <th className={`${th} text-right`}>No attribution</th>
                <th className={`${th} text-right`}>Third-party</th>
              </tr>
            </thead>
            <tbody>
              {perTable.map((t) => (
                <tr key={t.table}>
                  <td className={td}>{t.table}</td>
                  <td className={`${td} text-right tabular-nums`}>{n(t.total)}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.missing ? <Badge tone="warning">{n(t.missing)}</Badge> : 0}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.third_party ? <Badge tone="danger">{n(t.third_party)}</Badge> : 0}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card title="Attribution lines">
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Attribution text</th>
                <th className={th}>Source</th>
                <th className={th}>Licence</th>
                {ATTRIBUTION_TABLES.map((t) => (
                  <th key={t} className={`${th} text-right`}>
                    {SHORT[t]}
                  </th>
                ))}
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>3rd party</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.attribution_text}|${r.source_id}|${r.licence_id}`}>
                  <td className={td}>
                    <div className="w-64 whitespace-normal sm:w-80">{r.attribution_text || <Badge tone="warning">none</Badge>}</div>
                  </td>
                  <td className={td}>{r.source_id || "–"}</td>
                  <td className={td}>{r.licence_id || "–"}</td>
                  {ATTRIBUTION_TABLES.map((t) => (
                    <td key={t} className={`${td} text-right tabular-nums ${r.counts[t] ? "" : "text-muted"}`}>
                      {r.counts[t] ? n(r.counts[t]) : "·"}
                    </td>
                  ))}
                  <td className={`${td} text-right font-medium tabular-nums`}>{n(r.total)}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.third_party ? <Badge tone="danger">{n(r.third_party)}</Badge> : 0}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-2 text-xs text-muted">Cached for up to a minute.</p>
        </Card>
      </div>
    </Page>
  );
}
