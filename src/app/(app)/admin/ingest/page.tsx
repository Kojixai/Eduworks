import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import type { Where } from "@/lib/db/store";
import { LOG_LEVELS, fmtDate, fmtDuration, hrefWith, pageOf, param, statsSummary, type IngestRun } from "@/lib/admin";
import { Badge, ButtonLink, Card, Checkbox, EmptyState, Page, PageHeader } from "@/components/ui";
import { Filters, Pager, StatusBadge, TableWrap, td, th, type SP, ExportButton } from "../_ui";

export const metadata = { title: "Ingest" };

const RUNS = 25;
const LOGS = 50;

export default async function IngestPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const runPage = pageOf(sp.runs_page);
  const page = pageOf(sp.page);
  const level = param(sp.level);
  const source = param(sp.source);
  const run = param(sp.run);

  const logWhere: Where = { ...(level ? { level } : {}), ...(source ? { source_id: source } : {}), ...(run ? { run_id: run } : {}) };
  const [runTotal, runs, sources, logTotal, logs] = await Promise.all([
    store.count("ingest_runs"),
    store.select<IngestRun>("ingest_runs", { orderBy: [["started_at", "desc"]], limit: RUNS, offset: (runPage - 1) * RUNS }),
    store.select<{ id: string }>("sources", { columns: ["id"], orderBy: [["id", "asc"]] }),
    store.count("ingest_logs", logWhere),
    store.select<{ id: string; run_id: string | null; source_id: string | null; level: string; code: string | null; message: string; context_json: string | null; created_at: string }>("ingest_logs", {
      where: logWhere,
      orderBy: [["created_at", "desc"], ["id", "asc"]],
      limit: LOGS,
      offset: (page - 1) * LOGS,
    }),
  ]);
  const runPages = Math.max(1, Math.ceil(runTotal / RUNS));

  return (
    <Page>
      <PageHeader
        title="Ingest"
        subtitle={`${runTotal} runs · ${logTotal} matching log entries`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton table="ingest_runs" format="csv">
              Runs CSV
            </ExportButton>
            <ExportButton table="ingest_logs" format="csv">
              Logs CSV
            </ExportButton>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3">
        <Card title="Runs">
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>Started</th>
                <th className={th}>Source</th>
                <th className={th}>Status</th>
                <th className={th}>Duration</th>
                <th className={th}>Stats</th>
                <th className={th}>Logs</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={run === r.id ? "bg-primary-soft" : ""}>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.started_at)}</td>
                  <td className={td}>{r.source_id}</td>
                  <td className={td}>
                    <StatusBadge status={r.status} />
                    {r.error && <span className="block w-48 text-xs text-danger">{r.error}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDuration(r.started_at, r.finished_at)}</td>
                  <td className={`${td} text-xs text-muted`}>
                    <div className="w-72 whitespace-normal">
                      {statsSummary(r.stats_json, 8)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className={td}>
                    <Link href={hrefWith("/admin/ingest", {}, { run: r.id })}>logs</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {runPages > 1 && (
            <div className="mt-2 flex gap-2">
              {runPage > 1 && (
                <ButtonLink variant="secondary" href={hrefWith("/admin/ingest", sp, { runs_page: runPage - 1 })}>
                  ← Newer
                </ButtonLink>
              )}
              {runPage < runPages && (
                <ButtonLink variant="secondary" href={hrefWith("/admin/ingest", sp, { runs_page: runPage + 1 })}>
                  Older →
                </ButtonLink>
              )}
            </div>
          )}
        </Card>

        <Card title="Logs" id="logs">
          <Filters
            path="/admin/ingest"
            sp={sp}
            defs={[
              { name: "level", label: "Level", any: "All", options: LOG_LEVELS.map((l) => [l, l]) },
              { name: "source", label: "Source", any: "All", options: sources.map((s) => [s.id, s.id]) },
            ]}
          >
            {run && (
              <div className="col-span-2 min-w-0">
                <Checkbox name="run" value={run} defaultChecked label={<>Only run <code className="break-all">{run.slice(0, 8)}…</code></>} />
              </div>
            )}
          </Filters>
          {!logs.length ? (
            <EmptyState title="No log entries match." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {logs.map((l) => (
                <li key={l.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={l.level} />
                    {l.code && <Badge>{l.code}</Badge>}
                    <span className="text-xs text-muted">
                      {l.source_id} · {fmtDate(l.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 break-words">{l.message}</p>
                  {l.context_json && <pre className="mt-1 overflow-x-auto rounded-[var(--radius-sm)] bg-surface-muted p-2 text-xs">{l.context_json}</pre>}
                </li>
              ))}
            </ul>
          )}
          <Pager path="/admin/ingest" sp={sp} page={page} total={logTotal} size={LOGS} />
        </Card>
      </div>
    </Page>
  );
}
