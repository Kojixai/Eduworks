import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { fmtDate, ingestHealth, questionStatusMatrix, statsSummary } from "@/lib/admin";
import { Badge, Card, Grid, ListLink, Page, PageHeader, Stat } from "@/components/ui";
import { StatusBadge, TableWrap, n, td, th, ExportButton } from "./_ui";

export const metadata = { title: "Dashboard" };

const SECTIONS: Array<[string, string, string]> = [
  ["/admin/review", "Review queue", "Approve, reject or edit questions and statement links"],
  ["/admin/questions", "Questions", "Browse and filter every question"],
  ["/admin/lessons", "Lessons", "Lesson browser with content, links and provenance"],
  ["/admin/curriculum", "Curriculum", "Statement tree by key stage and subject"],
  ["/admin/papers", "Papers", "Papers and validation results"],
  ["/admin/coverage", "Coverage", "Heatmap of lessons and questions per strand"],
  ["/admin/sources", "Sources", "Source registry, licences and research"],
  ["/admin/ingest", "Ingest", "Ingest runs and logs"],
  ["/admin/attribution", "Attribution", "Attribution lines and record counts"],
  ["/admin/book-export", "Book export", "Print-ready units, lessons and questions"],
  ["/admin/redemptions", "Redemptions", "Book code redemptions and mailing list"],
];

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const store = await getStore();
  const [stats, qMatrix, health, live, audit] = await Promise.all([
    store.select<{ key: string; value: string; computed_at: string }>("dataset_stats", { orderBy: [["key", "asc"]] }),
    questionStatusMatrix(store),
    ingestHealth(store),
    Promise.all(
      (["curriculum_statements", "units", "lessons", "questions", "papers", "sources", "raw_files", "ingest_runs", "redemptions", "parents", "students"] as const).map(
        async (t) => [t, await store.count(t, t === "curriculum_statements" ? { level: "statement" } : undefined)] as const,
      ),
    ),
    store.select<{ id: string; actor: string; action: string; entity: string; entity_id: string; created_at: string }>("admin_audit", { orderBy: [["created_at", "desc"]], limit: 8 }),
  ]);
  const liveMap = new Map(live);
  const statsAt = stats[0]?.computed_at;
  const needsReview = qMatrix.filter((r) => r.review_status === "needs_review").reduce((s, r) => s + r.n, 0);
  const qTotal = qMatrix.reduce((s, r) => s + r.n, 0);

  return (
    <Page>
      <PageHeader title="Admin" subtitle={`Signed in as ${admin.email}`} />

      <Grid cols={4}>
        <Stat label="Statements" value={n(liveMap.get("curriculum_statements"))} />
        <Stat label="Lessons" value={n(liveMap.get("lessons"))} hint={`${n(liveMap.get("units"))} units`} />
        <Stat label="Questions" value={n(qTotal)} hint={`${n(needsReview)} need review`} />
        <Stat label="Redemptions" value={n(liveMap.get("redemptions"))} hint={`${n(liveMap.get("parents"))} parents`} />
      </Grid>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <Card title="Dataset totals">
          <p className="mb-2 text-xs text-muted">From dataset_stats (computed {fmtDate(statsAt)}) and live counts.</p>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Key</th>
                <th className={`${th} text-right`}>dataset_stats</th>
                <th className={`${th} text-right`}>Live count</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const lv = liveMap.get(s.key as never);
                return (
                  <tr key={s.key}>
                    <td className={td}>{s.key}</td>
                    <td className={`${td} text-right`}>{Number.isFinite(Number(s.value)) ? n(Number(s.value)) : s.value}</td>
                    <td className={`${td} text-right`}>{lv === undefined ? "" : lv === Number(s.value) ? n(lv) : <Badge tone="warning">{n(lv)}</Badge>}</td>
                  </tr>
                );
              })}
              {(["sources", "raw_files", "ingest_runs", "students"] as const).map((k) => (
                <tr key={k}>
                  <td className={td}>{k}</td>
                  <td className={`${td} text-right text-muted`}>–</td>
                  <td className={`${td} text-right`}>{n(liveMap.get(k))}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card title="Questions by review status">
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Review status</th>
                <th className={`${th} text-right`}>Not third-party</th>
                <th className={`${th} text-right`}>Third-party</th>
              </tr>
            </thead>
            <tbody>
              {["auto_ok", "needs_review", "rejected"].map((rs) => (
                <tr key={rs}>
                  <td className={td}>
                    <StatusBadge status={rs} />
                  </td>
                  {[0, 1].map((tp) => (
                    <td key={tp} className={`${td} text-right`}>
                      <a href={`/admin/questions?review_status=${rs}&third_party_flag=${tp}`}>{n(qMatrix.find((r) => r.review_status === rs && r.third_party_flag === tp)?.n)}</a>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-2 text-xs text-muted">Public = auto_ok and not third-party.</p>
        </Card>

        <Card title="Ingest health">
          <p className="mb-2 text-xs text-muted">Latest run per source.</p>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Source</th>
                <th className={th}>Access</th>
                <th className={th}>Last run</th>
                <th className={th}>Finished</th>
                <th className={`${th} text-right`}>Warn / error</th>
                <th className={th}>Stats</th>
              </tr>
            </thead>
            <tbody>
              {health.map(({ source, run, warn, error }) => (
                <tr key={source.id}>
                  <td className={td}>{source.id}</td>
                  <td className={td}>
                    <StatusBadge status={source.access_status} />
                  </td>
                  <td className={td}>{run ? <StatusBadge status={run.status} /> : <span className="text-muted">never</span>}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(run?.finished_at)}</td>
                  <td className={`${td} text-right`}>
                    {run ? (
                      <a href={`/admin/ingest?run=${encodeURIComponent(run.id)}`}>
                        {warn} / {error}
                      </a>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className={`${td} text-xs text-muted`}>
                    {statsSummary(run?.stats_json, 3)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card title="Source access">
          <div className="flex flex-wrap gap-2">
            {health.map(({ source }) => (
              <span key={source.id} className="inline-flex items-center gap-1 text-sm">
                {source.id} <StatusBadge status={source.access_status} />
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {health.filter((h) => h.source.access_status === "reachable").length} reachable · {health.filter((h) => h.source.access_status === "blocked").length} blocked
          </p>
        </Card>

        <Card title="Exports">
          <div className="grid gap-2 sm:grid-cols-2">
            <ExportButton table="questions" format="csv" full>
              Questions (CSV)
            </ExportButton>
            <ExportButton table="questions" format="json" full>
              Questions (JSON)
            </ExportButton>
            <ExportButton table="curriculum_statements" format="csv" full>
              Statements (CSV)
            </ExportButton>
            <ExportButton table="coverage_matrix" format="csv" full>
              Coverage (CSV)
            </ExportButton>
            <ExportButton table="redemptions" format="csv" full>
              Redemptions (CSV)
            </ExportButton>
            <ExportButton table="mailing_list" format="csv" full>
              Mailing list (CSV)
            </ExportButton>
          </div>
          <p className="mt-2 text-xs text-muted">Any content table: /api/admin/export?table=&lt;name&gt;&amp;format=csv|json</p>
        </Card>

        <Card title="Sections">
          {SECTIONS.map(([href, title, meta]) => (
            <ListLink key={href} href={href} title={title} meta={meta} />
          ))}
        </Card>

        <Card title="Recent admin changes">
          {audit.length ? (
            <ul className="divide-y divide-border text-sm">
              {audit.map((a) => (
                <li key={a.id} className="py-2">
                  <Badge>{a.action}</Badge> {a.entity} <span className="break-all text-muted">{a.entity_id}</span>
                  <span className="block text-xs text-muted">
                    {a.actor} · {fmtDate(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No changes yet.</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
