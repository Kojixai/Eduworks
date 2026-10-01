import fs from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { Badge, Card, Page, PageHeader } from "@/components/ui";
import { ExtLink, Facts, StatusBadge, TableWrap, n, td, th, ExportButton } from "../_ui";

export const metadata = { title: "Sources" };

interface Source {
  id: string;
  name: string;
  publisher: string | null;
  home_url: string | null;
  licence_id: string | null;
  licence_evidence: string | null;
  licence_evidence_url: string | null;
  access_status: string;
  access_notes: string | null;
  kind: string | null;
  attribution_text: string | null;
  updated_at: string;
}
interface Research {
  id: string;
  name: string;
  publisher?: string;
  url?: string;
  licence?: string;
  evidence_quote?: string;
  evidence_url?: string;
  key_stages?: string[];
  subjects?: string[];
  what_it_gives_us?: string;
  reachable_now?: boolean;
  recommendation?: string;
}

async function readResearch(): Promise<Research[] | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "research", "open_sources.json"), "utf8");
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? (j as Research[]) : null;
  } catch {
    return null;
  }
}

export default async function SourcesPage() {
  await requireAdmin();
  const store = await getStore();
  const [sources, licences, research] = await Promise.all([
    store.select<Source>("sources", { orderBy: [["id", "asc"]] }),
    store.select<{ id: string; name: string; url: string | null }>("licences"),
    readResearch(),
  ]);
  const lic = new Map(licences.map((l) => [l.id, l]));
  const rawCounts = new Map(await Promise.all(sources.map(async (s) => [s.id, await store.count("raw_files", { source_id: s.id })] as const)));

  return (
    <Page>
      <PageHeader title="Sources" subtitle={`${sources.length} registered sources`} actions={<ExportButton table="sources" format="csv">Export CSV</ExportButton>} />
      <div className="grid grid-cols-1 gap-3">
        {sources.map((s) => {
          const l = s.licence_id ? lic.get(s.licence_id) : undefined;
          return (
            <Card key={s.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{s.name}</h2>
                  <p className="text-xs text-muted">
                    {s.id}
                    {s.publisher ? ` · ${s.publisher}` : ""}
                    {s.kind ? ` · ${s.kind}` : ""}
                  </p>
                </div>
                <StatusBadge status={s.access_status} />
              </div>
              <Facts
                rows={[
                  ["Licence", l ? <>{l.url ? <ExtLink href={l.url}>{l.name}</ExtLink> : l.name} <Badge>{s.licence_id}</Badge></> : (s.licence_id ?? "–")],
                  ["Licence evidence", s.licence_evidence ? <q className="text-sm">{s.licence_evidence}</q> : "–"],
                  ["Evidence URL", s.licence_evidence_url ? <ExtLink href={s.licence_evidence_url} /> : "–"],
                  ["Home", s.home_url ? <ExtLink href={s.home_url} /> : "–"],
                  ["Access notes", s.access_notes ?? "–"],
                  ["Attribution", s.attribution_text ?? "–"],
                  ["Raw files", n(rawCounts.get(s.id))],
                ]}
              />
            </Card>
          );
        })}

        <Card title="Open source research">
          <p className="mb-2 text-xs text-muted">From data/research/open_sources.json{research ? ` (${research.length} entries)` : ""}.</p>
          {research ? (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Source</th>
                  <th className={th}>Licence</th>
                  <th className={th}>Evidence</th>
                  <th className={th}>Key stages</th>
                  <th className={th}>Reachable</th>
                  <th className={th}>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {research.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>
                      <div className="w-56">
                        {r.url ? <ExtLink href={r.url}>{r.name}</ExtLink> : r.name}
                        {r.publisher && <span className="block text-xs text-muted">{r.publisher}</span>}
                      </div>
                    </td>
                    <td className={td}>
                      <Badge>{r.licence ?? "?"}</Badge>
                    </td>
                    <td className={`${td} text-xs`}>
                      <div className="w-72">
                        {r.evidence_quote}
                        {r.evidence_url && (
                          <span className="mt-1 block">
                            <ExtLink href={r.evidence_url}>evidence</ExtLink>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={td}>{(r.key_stages ?? []).join(", ")}</td>
                    <td className={td}>{r.reachable_now === undefined ? "–" : r.reachable_now ? <Badge tone="success">yes</Badge> : <Badge tone="danger">no</Badge>}</td>
                    <td className={`${td} text-xs`}>
                      <div className="w-72">{r.recommendation}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-muted">Research file not found.</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
