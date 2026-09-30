/** Small admin-only building blocks composed from the shared kit (src/components/ui.tsx). */
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, ButtonLink, Select } from "@/components/ui";
import { hrefWith } from "@/lib/admin";

export type SP = Record<string, string | string[] | undefined>;

/** Wide tables scroll inside this wrapper so the page itself never scrolls sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}
export const th = "border-b border-border px-2 py-2 text-left text-xs font-medium text-muted";
export const td = "border-b border-border px-2 py-2 align-top";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "unknown";
  const tone =
    s === "auto_ok" || s === "ok" || s === "passed" || s === "reachable" || s === "verified"
      ? "success"
      : s === "needs_review" || s === "pending" || s === "running" || s === "partial" || s === "warn" || s === "unverified" || s === "unknown"
        ? "warning"
        : s === "rejected" || s === "failed" || s === "blocked" || s === "error"
          ? "danger"
          : "neutral";
  return <Badge tone={tone}>{s}</Badge>;
}

export function Pager({ path, sp, page, total, size }: { path: string; sp: SP; page: number; total: number; size: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return <p className="mt-3 text-xs text-muted">{total.toLocaleString("en-GB")} result{total === 1 ? "" : "s"}</p>;
  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted">
        Page {page} of {pages.toLocaleString("en-GB")} · {total.toLocaleString("en-GB")} results
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <ButtonLink variant="secondary" href={hrefWith(path, sp, { page: page - 1 })}>
            ← Prev
          </ButtonLink>
        )}
        {page < pages && (
          <ButtonLink variant="secondary" href={hrefWith(path, sp, { page: page + 1 })}>
            Next →
          </ButtonLink>
        )}
      </span>
    </nav>
  );
}

export interface FilterDef {
  name: string;
  label: string;
  options: Array<[string, string]>;
  /** Label of the "no filter" option; omit to force a value. */
  any?: string;
}

/** GET filter form: works without JavaScript. */
export function Filters({ path, sp, defs, children }: { path: string; sp: SP; defs: FilterDef[]; children?: ReactNode }) {
  const val = (n: string) => {
    const v = sp[n];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  return (
    <form method="get" action={path} className="no-print mb-4 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {defs.map((d) => (
          <label key={d.name} className="block min-w-0 text-xs text-muted">
            {d.label}
            <Select name={d.name} defaultValue={val(d.name)} className="mt-1 text-sm text-ink">
              {d.any !== undefined && <option value="">{d.any}</option>}
              {d.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        ))}
        {children}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="submit">Apply</Button>
        <ButtonLink variant="ghost" href={path}>
          Reset
        </ButtonLink>
      </div>
    </form>
  );
}

/** Definition list for key/value facts (provenance, metadata). */
export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-muted sm:text-sm">{k}</dt>
          <dd className="mb-1 min-w-0 break-words sm:mb-0">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface Provenance {
  source_id?: string | null;
  source_url?: string | null;
  licence_id?: string | null;
  attribution_text?: string | null;
  retrieved_at?: string | null;
  third_party_flag?: number | null;
  checksum?: string | null;
}

export function ProvenanceFacts({ p }: { p: Provenance }) {
  return (
    <Facts
      rows={[
        ["Source", p.source_id ? <Link href="/admin/sources">{p.source_id}</Link> : "–"],
        ["Source URL", p.source_url ? <ExtLink href={p.source_url} /> : "–"],
        ["Licence", p.licence_id ?? "–"],
        ["Attribution", p.attribution_text ?? "–"],
        ["Retrieved", p.retrieved_at ?? "–"],
        ["Third party", p.third_party_flag ? <Badge tone="danger">third-party</Badge> : "no"],
        ["Checksum", p.checksum ? <code className="break-all text-xs">{p.checksum}</code> : "–"],
      ]}
    />
  );
}

export function ExtLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all">
      {children ?? href}
    </a>
  );
}

export const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-GB");
