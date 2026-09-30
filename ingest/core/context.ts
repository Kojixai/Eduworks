import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DataStore, Row } from "../../src/lib/db/store";
import { httpGet } from "./http";

export const ROOT = path.resolve(__dirname, "..", "..");
/** Raw downloads live outside git (see .gitignore). Re-downloadable from the manifest. */
export const WORK_DIR = process.env.EDU_WORK_DIR ?? path.join(ROOT, ".work", "raw");
export const CHECKPOINT_DIR = path.join(ROOT, "data", "checkpoints");
export const MANIFEST_DIR = path.join(ROOT, "data", "raw-manifest");

export const now = () => new Date().toISOString();
export const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
export const shortHash = (s: string) => sha256(s).slice(0, 16);
export const newId = () => crypto.randomUUID();

export interface Provenance {
  source_id: string;
  source_url: string | null;
  licence_id: string;
  attribution_text: string;
  retrieved_at: string;
  third_party_flag: 0 | 1;
  checksum: string | null;
}

export type Level = "info" | "warn" | "error";

/** Per-source ingest context: run bookkeeping, logs, checkpoints, raw files, provenance. */
export class IngestContext {
  readonly runId = newId();
  private stats: Record<string, number> = {};
  private checkpoints: Record<string, string>;
  private checkpointFile: string;

  constructor(
    readonly store: DataStore,
    readonly sourceId: string,
    readonly licenceId: string,
    readonly attribution: string,
  ) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    this.checkpointFile = path.join(CHECKPOINT_DIR, `${sourceId}.json`);
    this.checkpoints = fs.existsSync(this.checkpointFile)
      ? JSON.parse(fs.readFileSync(this.checkpointFile, "utf8"))
      : {};
  }

  async start() {
    await this.store.insert("ingest_runs", {
      id: this.runId,
      source_id: this.sourceId,
      started_at: now(),
      status: "running",
    });
  }

  async finish(status: "ok" | "partial" | "failed" | "blocked", error?: string) {
    await this.store.update(
      "ingest_runs",
      { id: this.runId },
      { finished_at: now(), status, stats_json: JSON.stringify(this.stats), error: error ?? null },
    );
  }

  bump(key: string, n = 1) {
    this.stats[key] = (this.stats[key] ?? 0) + n;
  }
  getStats() {
    return { ...this.stats };
  }

  async log(level: Level, code: string, message: string, context?: unknown) {
    if (level !== "info" || process.env.EDU_VERBOSE) console.log(`[${this.sourceId}] ${level.toUpperCase()} ${code}: ${message}`);
    await this.store.insert("ingest_logs", {
      id: newId(),
      run_id: this.runId,
      source_id: this.sourceId,
      level,
      code,
      message,
      context_json: context === undefined ? null : JSON.stringify(context),
      created_at: now(),
    });
    if (level !== "info") this.bump(`log_${level}`);
  }

  // ---- checkpoints: committed to the repo so "continue" resumes after a lost session ----
  isDone(key: string) {
    return this.checkpoints[key] !== undefined;
  }
  getCheckpoint(key: string) {
    return this.checkpoints[key];
  }
  async markDone(key: string, value = "done") {
    this.checkpoints[key] = value;
    fs.writeFileSync(this.checkpointFile, JSON.stringify(this.checkpoints, null, 1));
    await this.store.upsert(
      "ingest_checkpoints",
      { source_id: this.sourceId, key, value, updated_at: now() },
      ["source_id", "key"],
    );
  }
  resetCheckpoints() {
    this.checkpoints = {};
    if (fs.existsSync(this.checkpointFile)) fs.unlinkSync(this.checkpointFile);
  }

  prov(sourceUrl: string | null, checksum: string | null, thirdParty = false, attribution?: string): Provenance {
    return {
      source_id: this.sourceId,
      source_url: sourceUrl,
      licence_id: this.licenceId,
      attribution_text: attribution ?? this.attribution,
      retrieved_at: now(),
      third_party_flag: thirdParty ? 1 : 0,
      checksum,
    };
  }

  /**
   * Download (or reuse) a raw file. Bytes go to WORK_DIR (never committed); the URL, checksum
   * and retrieval date are recorded in raw_files and in data/raw-manifest/<source>.jsonl.
   */
  async fetchRaw(url: string, fileName?: string): Promise<{ path: string; checksum: string; body: Buffer; contentType: string }> {
    const dir = path.join(WORK_DIR, this.sourceId);
    fs.mkdirSync(dir, { recursive: true });
    const local = path.join(dir, fileName ?? `${shortHash(url)}${path.extname(new URL(url).pathname) || ".bin"}`);
    const id = `${this.sourceId}:${shortHash(url)}`;
    if (fs.existsSync(local)) {
      const body = fs.readFileSync(local);
      return { path: local, checksum: sha256(body), body, contentType: "" };
    }
    const r = await httpGet(url);
    if (r.status >= 400) {
      await this.store.upsert(
        "raw_files",
        { id, source_id: this.sourceId, url, status: "error", error: `HTTP ${r.status}`, retrieved_at: now() },
        ["id"],
      );
      throw new Error(`HTTP ${r.status} for ${url}`);
    }
    fs.writeFileSync(local, r.body);
    const checksum = sha256(r.body);
    const rec: Row = {
      id,
      source_id: this.sourceId,
      url,
      local_path: path.relative(ROOT, local),
      checksum_sha256: checksum,
      bytes: r.body.length,
      content_type: r.contentType,
      retrieved_at: now(),
      status: "ok",
    };
    await this.store.upsert("raw_files", rec, ["id"]);
    fs.mkdirSync(MANIFEST_DIR, { recursive: true });
    fs.appendFileSync(path.join(MANIFEST_DIR, `${this.sourceId}.jsonl`), JSON.stringify(rec) + "\n");
    this.bump("raw_files");
    return { path: local, checksum, body: r.body, contentType: r.contentType };
  }

  /** Record a raw file that came from a git checkout or another non-HTTP route. */
  async registerRaw(url: string, localPath: string, body: Buffer, meta?: unknown) {
    const id = `${this.sourceId}:${shortHash(url)}`;
    const rec: Row = {
      id,
      source_id: this.sourceId,
      url,
      local_path: path.relative(ROOT, localPath),
      checksum_sha256: sha256(body),
      bytes: body.length,
      content_type: "text/plain",
      retrieved_at: now(),
      status: "ok",
      meta_json: meta ? JSON.stringify(meta) : null,
    };
    await this.store.upsert("raw_files", rec, ["id"]);
    return rec.checksum_sha256 as string;
  }
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
