/** Test helpers for tests/govuk_*.test.ts: fixture fetcher, synthetic PDFs, checkpoint isolation. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteStore } from "../../../src/lib/db/sqlite";
import { CHECKPOINT_DIR, sha256 } from "../../../ingest/core/context";
import { BlockedHostError } from "../../../ingest/core/http";
import type { Fetcher } from "../../../ingest/sources/govuk_common";
import { seedReference } from "../../../ingest/sources/reference";

export const FIX = __dirname;
export const GOV = "https://www.gov.uk";
export const ASSETS = "https://assets.publishing.service.gov.uk/media";
export const api = (p: string) => `${GOV}/api/content${p}`;
export const readFix = (p: string) => fs.readFileSync(path.join(FIX, p), "utf8");

export type Route = Record<string, unknown> | { file: string };

/** Fetcher over an in-memory route table (Content API JSON objects or local PDF files). Unknown URL -> HTTP 404. */
export function makeFetcher(routes: Record<string, Route>) {
  const requested: string[] = [];
  const fetcher: Fetcher = async (url) => {
    requested.push(url);
    const r = routes[url];
    if (!r) throw new Error(`HTTP 404 for ${url}`);
    if (typeof (r as { file?: unknown }).file === "string") {
      const file = (r as { file: string }).file;
      const body = fs.readFileSync(file);
      return { body, checksum: sha256(body), contentType: "application/pdf", path: file };
    }
    const body = Buffer.from(JSON.stringify(r));
    return { body, checksum: sha256(body), contentType: "application/json" };
  };
  return { fetcher, requested };
}

export const blockedFetcher: Fetcher = async (url) => {
  throw new BlockedHostError(new URL(url).host);
};

/** Content API document helpers. */
export const collection = (base_path: string, title: string, docs: Array<{ base_path: string; title: string; public_updated_at?: string }>, body = "") => ({
  base_path,
  title,
  document_type: "document_collection",
  details: { body },
  links: { documents: docs.map((d) => ({ ...d, document_type: "guidance" })) },
});
export const publication = (base_path: string, title: string, attachments: Array<Record<string, unknown>>, body = "") => ({
  base_path,
  title,
  document_type: "guidance",
  details: { body, attachments },
  links: {},
});
export const htmlPublication = (base_path: string, title: string, body: string) => ({
  base_path,
  title,
  document_type: "html_publication",
  details: { body },
  links: {},
});
export const pdfAtt = (title: string, file: string) => ({
  attachment_type: "file",
  content_type: "application/pdf",
  title,
  url: `${ASSETS}/0000${sha256(title).slice(0, 20)}/${file}`,
  filename: file,
});
export const htmlAtt = (title: string, base_path: string) => ({ attachment_type: "html", title, url: base_path });

let pdfDir: string | null = null;
/** Generate the synthetic PDFs once per test process. */
export function pdfs(): string {
  if (pdfDir) return pdfDir;
  pdfDir = fs.mkdtempSync(path.join(os.tmpdir(), "govuk-fixtures-"));
  execFileSync("python3", [path.join(FIX, "make_pdfs.py"), pdfDir], { stdio: "pipe" });
  return pdfDir;
}
export const pdf = (name: string) => ({ file: path.join(pdfs(), name) });

export async function newStore() {
  const store = new SqliteStore(":memory:");
  await store.migrate();
  await seedReference(store);
  return store;
}

/** Back up / clear / restore data/checkpoints/<source>.json around tests. */
export function checkpointGuard(sources: string[]) {
  const files = sources.map((s) => path.join(CHECKPOINT_DIR, `${s}.json`));
  const backup = new Map<string, string>();
  return {
    save() {
      for (const f of files) if (fs.existsSync(f)) backup.set(f, fs.readFileSync(f, "utf8"));
    },
    clear() {
      for (const f of files) if (fs.existsSync(f)) fs.unlinkSync(f);
    },
    restore() {
      for (const f of files) {
        if (backup.has(f)) fs.writeFileSync(f, backup.get(f)!);
        else if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    },
  };
}

export async function lastRun(store: SqliteStore, source: string) {
  return store.raw<{ status: string; error: string | null; id: string }>(
    "SELECT * FROM ingest_runs WHERE source_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
    source,
  )[0];
}
export function logs(store: SqliteStore, source: string, code?: string) {
  return store.raw<{ level: string; code: string; message: string; context_json: string | null }>(
    `SELECT * FROM ingest_logs WHERE source_id = ?${code ? " AND code = ?" : ""} ORDER BY rowid`,
    ...(code ? [source, code] : [source]),
  );
}
