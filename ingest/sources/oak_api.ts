/**
 * Source: Oak National Academy Open Curriculum API v0 (OGL v3.0 except where stated).
 * Adds what the ontology does not carry: starter/exit quizzes, transcripts, teacher tips,
 * content guidance, asset links and third-party-copyright (TPC) restriction flags.
 *
 * Needs an API key: OAK_API_KEY in the environment, or in .env.local / .env at the repo root.
 * Auth is `Authorization: Bearer <key>` (spec securitySchemes.bearerAuth). Default quota is
 * 1000 requests per rolling hour, reported in X-RateLimit-{Limit,Remaining,Reset} headers and by
 * GET /rate-limit (free). The run is resumable: every finished lesson is checkpointed as
 * `lesson:<slug>`, every finished batch-question page set as `bank:<ks>:<subject>` / `seqbank:<seq>`.
 */
import fs from "node:fs";
import path from "node:path";
import { EnvHttpProxyAgent, fetch } from "undici";
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, ROOT, WORK_DIR, MANIFEST_DIR, chunk, now, shortHash } from "../core/context";
import { BlockedHostError } from "../core/http";
import { OAK_ATTRIBUTION, OAK_SUBJECT_MAP, SOURCES, subjectName } from "./registry";
import {
  OAK_API_BASE,
  hasNextLink,
  lessonIdFor,
  makeProv,
  mapAssets,
  mapQuestion,
  mapQuiz,
  mapSummaryBlocks,
  mapTranscriptBlock,
  mergeLesson,
  parseDotEnv,
  questionContentHash,
  questionStatementLinks,
  sha256,
  unitIdFor,
  type MappedQuestion,
  type OakAssets,
  type OakKsSubjectLessons,
  type OakLessonQuestions,
  type OakLessonSummary,
  type OakQuizResponse,
  type OakRestrictions,
  type OakTranscript,
  type ProvBlock,
} from "./oak_api_map";

const SRC = SOURCES.find((s) => s.id === "oak_api")!;
export const OAK_BULK_URL = "https://open-api.thenational.academy/api/bulk";
const KEY_STAGES = ["ks1", "ks2", "ks3", "ks4"];
const PAGE = 300; // spec maximum for limit

// ---------------------------------------------------------------- HTTP (injectable)

export interface OakHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  url: string;
}
export interface OakHttp {
  request(method: "GET" | "POST", url: string, opts?: { headers?: Record<string, string>; body?: string }): Promise<OakHttpResponse>;
}

let dispatcher: EnvHttpProxyAgent | undefined;
/** Default transport: undici through the env proxy; network-policy failures become BlockedHostError (as in core/http.ts). */
export const defaultOakHttp: OakHttp = {
  async request(method, url, opts = {}) {
    dispatcher ??= new EnvHttpProxyAgent();
    try {
      const res = await fetch(url, {
        method,
        dispatcher,
        headers: { "user-agent": "eduworks-ingest/1.0 (+curriculum companion; contact via repo)", ...opts.headers },
        body: opts.body,
        signal: AbortSignal.timeout(120_000),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      return { status: res.status, headers, body: Buffer.from(await res.arrayBuffer()), url: res.url || url };
    } catch (e) {
      const msg = String((e as { cause?: unknown }).cause ?? e);
      if (/cancelled|ECONNREFUSED|ENOTFOUND|403|407|EAI_AGAIN/i.test(msg)) throw new BlockedHostError(new URL(url).host, e);
      throw e;
    }
  },
};

export interface OakApiDeps {
  http?: OakHttp;
  /** Environment to read OAK_API_KEY from (default process.env). */
  env?: Record<string, string | undefined>;
  /** Directory holding .env / .env.local (default repo root). */
  rootDir?: string;
  /** Where raw JSON responses are written (default WORK_DIR/oak_api). null = do not write bodies. */
  rawDir?: string | null;
  /** Append raw file records to data/raw-manifest/oak_api.jsonl (default true). */
  manifest?: boolean;
  sleep?: (ms: number) => Promise<void>;
  /** Longest single wait for a rate-limit window before stopping with status 'partial' (default 65 min). */
  maxWaitMs?: number;
  /** Stop after this many counted requests (status 'partial'; rerun resumes). Env OAK_API_MAX_REQUESTS. */
  maxRequests?: number;
  /** Restrict the walk (env OAK_API_SUBJECTS / OAK_API_KEY_STAGES, comma separated). */
  subjects?: string[];
  keyStages?: string[];
  /** Ignore checkpoints (env EDU_FORCE). */
  force?: boolean;
  /** Also pull GET /sequences/{seq}/questions for every sequence (default true). */
  sequenceQuestions?: boolean;
}

export type OakApiResult = { status: "ok" | "partial" | "blocked" | "failed"; stats: Record<string, number> };

class StopRun extends Error {
  constructor(readonly status: "partial" | "blocked", message: string, readonly code: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- API key

export function readApiKey(env: Record<string, string | undefined>, rootDir: string): { key: string | null; from: string | null } {
  if (env.OAK_API_KEY?.trim()) return { key: env.OAK_API_KEY.trim(), from: "environment" };
  for (const f of [".env.local", ".env"]) {
    const p = path.join(rootDir, f);
    try {
      if (!fs.existsSync(p)) continue;
      const v = parseDotEnv(fs.readFileSync(p, "utf8")).OAK_API_KEY?.trim();
      if (v) return { key: v, from: f };
    } catch {
      /* unreadable file: ignore */
    }
  }
  return { key: null, from: null };
}

// ---------------------------------------------------------------- client with rate limiting

class OakClient {
  requests = 0;
  private remaining: number | null = null;
  private reset: number | null = null;
  constructor(
    private ctx: IngestContext,
    private http: OakHttp,
    private key: string,
    private sleep: (ms: number) => Promise<void>,
    private maxWaitMs: number,
    private maxRequests: number,
    private rawDir: string | null,
    private manifest: boolean,
  ) {}

  private noteHeaders(h: Record<string, string>) {
    const rem = Number(h["x-ratelimit-remaining"]);
    const reset = Number(h["x-ratelimit-reset"] ?? h["x-retry-after"]);
    if (Number.isFinite(rem) && h["x-ratelimit-remaining"] !== undefined) this.remaining = rem;
    if (Number.isFinite(reset) && reset > 0) this.reset = reset;
  }

  private async waitUntil(resetMs: number | null, why: string) {
    const wait = resetMs ? Math.max(1000, resetMs - Date.now() + 1000) : 60_000;
    if (wait > this.maxWaitMs)
      throw new StopRun("partial", `Rate-limit window resets in ${Math.round(wait / 60000)} min (> max wait); rerun later to resume.`, "rate_limit_stop");
    await this.ctx.log("info", "rate_limit_wait", `${why}; waiting ${Math.round(wait / 1000)}s`, { reset: resetMs });
    this.ctx.bump("rate_limit_waits");
    await this.sleep(wait);
    this.remaining = null;
  }

  async rateLimitStatus() {
    const r = await this.http.request("GET", `${OAK_API_BASE}/rate-limit`, { headers: this.auth() });
    if (r.status === 401) throw new StopRun("blocked", "OAK_API_KEY was rejected by the API (401).", "invalid_api_key");
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body.toString("utf8")) as { limit: number; remaining: number; reset: number };
        this.remaining = j.remaining;
        this.reset = j.reset;
        return j;
      } catch {
        /* ignore malformed */
      }
    }
    return null;
  }

  private auth() {
    return { authorization: `Bearer ${this.key}`, accept: "application/json" };
  }

  /** GET/POST a JSON endpoint. Returns status + parsed body + checksum; 4xx are returned, not thrown. */
  async json<T>(pathOrUrl: string, opts: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<{ status: number; data: T | null; url: string; checksum: string; headers: Record<string, string>; text: string }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${OAK_API_BASE}${pathOrUrl}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.requests >= this.maxRequests)
        throw new StopRun("partial", `Request budget of ${this.maxRequests} reached; rerun to resume.`, "request_budget");
      if (this.remaining !== null && this.remaining <= 2 && this.reset && this.reset > Date.now())
        await this.waitUntil(this.reset, `Only ${this.remaining} requests left in this window`);
      this.requests++;
      this.ctx.bump("api_requests");
      const r = await this.http.request(opts.method ?? "GET", url, {
        headers: { ...this.auth(), ...(opts.body ? { "content-type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      this.noteHeaders(r.headers);
      if (r.status === 429) {
        const reset = Number(r.headers["x-retry-after"] ?? r.headers["x-ratelimit-reset"]);
        const retryAfterSec = Number(r.headers["retry-after"]);
        await this.waitUntil(Number.isFinite(reset) && reset > 0 ? reset : Number.isFinite(retryAfterSec) ? Date.now() + retryAfterSec * 1000 : null, "HTTP 429");
        continue;
      }
      if (r.status >= 500) {
        await this.sleep(2000 * 2 ** attempt);
        continue;
      }
      if (r.status === 401) throw new StopRun("blocked", "OAK_API_KEY was rejected by the API (401).", "invalid_api_key");
      const text = r.body.toString("utf8");
      const checksum = sha256(r.body);
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      await this.recordRaw(url, r, checksum);
      return { status: r.status, data, url, checksum, headers: r.headers, text };
    }
    throw new Error(`Gave up on ${url} after repeated 429/5xx responses`);
  }

  private async recordRaw(url: string, r: OakHttpResponse, checksum: string) {
    const id = `oak_api:${shortHash(url)}`;
    let local: string | null = null;
    if (this.rawDir && r.status < 400) {
      fs.mkdirSync(this.rawDir, { recursive: true });
      const file = path.join(this.rawDir, `${shortHash(url)}.json`);
      fs.writeFileSync(file, r.body);
      local = path.relative(ROOT, file);
    }
    const rec: Row = {
      id,
      source_id: "oak_api",
      url,
      local_path: local,
      checksum_sha256: checksum,
      bytes: r.body.length,
      content_type: r.headers["content-type"] ?? "application/json",
      retrieved_at: now(),
      status: r.status < 400 ? "ok" : "error",
      error: r.status < 400 ? null : `HTTP ${r.status}`,
    };
    await this.ctx.store.upsert("raw_files", rec, ["id"]);
    if (this.manifest && r.status < 400) {
      fs.mkdirSync(MANIFEST_DIR, { recursive: true });
      fs.appendFileSync(path.join(MANIFEST_DIR, "oak_api.jsonl"), JSON.stringify(rec) + "\n");
    }
    this.ctx.bump("raw_files");
  }

  /** Walk an offset/limit endpoint until a short page (or no Link rel=next). */
  async paged<T>(p: string, countItems: (page: T[]) => number): Promise<{ items: T[]; urls: string[]; checksums: string[]; blocked: boolean }> {
    const items: T[] = [];
    const urls: string[] = [];
    const checksums: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const sep = p.includes("?") ? "&" : "?";
      const r = await this.json<T[]>(`${p}${sep}offset=${offset}&limit=${PAGE}`);
      if (r.status === 400 && isCopyrightBlock(r.text)) return { items, urls, checksums, blocked: true };
      if (r.status >= 400 || !Array.isArray(r.data)) {
        if (r.status !== 404) await this.ctx.log("warn", "page_failed", `HTTP ${r.status} for ${r.url}`);
        break;
      }
      items.push(...r.data);
      urls.push(r.url);
      checksums.push(r.checksum);
      const n = countItems(r.data);
      const link = r.headers["link"];
      if (!r.data.length || (link !== undefined ? !hasNextLink(link) : n < PAGE)) break;
    }
    return { items, urls, checksums, blocked: false };
  }
}

const isCopyrightBlock = (text: string) => /copyright|restricted|third.party/i.test(text);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- entry point

export async function ingestOakApi(store: DataStore, deps: OakApiDeps = {}): Promise<OakApiResult> {
  const env = deps.env ?? process.env;
  const http = deps.http ?? defaultOakHttp;
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  const done = async (status: OakApiResult["status"], error?: string): Promise<OakApiResult> => {
    await ctx.finish(status === "ok" ? "ok" : status, error);
    return { status, stats: ctx.getStats() };
  };

  try {
    const { key, from } = readApiKey(env, deps.rootDir ?? ROOT);
    if (!key) {
      // Does the bulk download work without a key? (Oak's /api/bulk runs the same auth check as v0.)
      let probe: string;
      try {
        const r = await http.request("POST", OAK_BULK_URL, {
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ subjects: ["maths-primary"] }),
        });
        probe = r.status === 401 ? "HTTP 401 (API token not provided or invalid): the bulk download also needs a key" : `HTTP ${r.status}`;
        await ctx.log(r.status === 200 ? "warn" : "info", "bulk_probe", `POST ${OAK_BULK_URL} without a key -> ${probe}`, { status: r.status });
      } catch (e) {
        if (!(e instanceof BlockedHostError)) throw e;
        probe = `host ${e.host} is blocked from this environment`;
        await ctx.log("warn", "host_blocked", `Bulk download probe failed: ${probe}`, { host: e.host, url: OAK_BULK_URL });
      }
      await ctx.log(
        "warn",
        "no_api_key",
        "No Oak API key. Set OAK_API_KEY (environment, or a line OAK_API_KEY=... in .env.local or .env at the repo root). " +
          "Keys are free from https://open-api.thenational.academy/ (sign up, then copy the key from the account page). " +
          `Bulk download check: ${probe}.`,
        { env_var: "OAK_API_KEY", files: [".env.local", ".env"], bulk_probe: probe },
      );
      return await done("blocked", "OAK_API_KEY not set");
    }
    await ctx.log("info", "api_key", `Using OAK_API_KEY from ${from}`);

    const maxRequests = deps.maxRequests ?? (Number(env.OAK_API_MAX_REQUESTS) || Infinity);
    const client = new OakClient(
      ctx,
      http,
      key,
      deps.sleep ?? defaultSleep,
      deps.maxWaitMs ?? 65 * 60_000,
      maxRequests,
      deps.rawDir === undefined ? path.join(WORK_DIR, "oak_api") : deps.rawDir,
      deps.manifest ?? true,
    );
    const rl = await client.rateLimitStatus();
    if (rl) await ctx.log("info", "rate_limit", `Quota ${rl.remaining}/${rl.limit}, resets ${new Date(rl.reset).toISOString()}`, rl);

    const force = deps.force ?? !!env.EDU_FORCE;
    const ing = new Ingestor(ctx, client, store, force);
    await ing.loadHashes();

    const subjFilter = deps.subjects ?? (env.OAK_API_SUBJECTS ? env.OAK_API_SUBJECTS.split(",").map((s) => s.trim()) : undefined);
    const ksFilter = deps.keyStages ?? (env.OAK_API_KEY_STAGES ? env.OAK_API_KEY_STAGES.split(",").map((s) => s.trim()) : undefined);

    const subjRes = await client.json<Array<string | { subjectSlug: string }>>("/subjects");
    const subjects = (subjRes.data ?? []).map((s) => (typeof s === "string" ? s : s.subjectSlug)).filter((s) => !subjFilter || subjFilter.includes(s));
    const sequences = new Map<string, string>(); // sequence slug -> oak subject

    for (const oakSubject of subjects) {
      const subjectId = OAK_SUBJECT_MAP[oakSubject];
      if (!subjectId) {
        await ctx.log("warn", "unmapped_subject", `Oak subject ${oakSubject} has no platform subject; skipped`);
        continue;
      }
      const det = await client.json<{
        keyStages?: Array<{ keyStageSlug: string }>;
        sequenceSlugs?: Array<{ sequenceSlug: string; keyStages?: Array<{ keyStageSlug: string }> }>;
      }>(`/subjects/${oakSubject}`);
      const kss = new Set<string>();
      for (const k of det.data?.keyStages ?? []) kss.add(k.keyStageSlug);
      for (const s of det.data?.sequenceSlugs ?? []) {
        sequences.set(s.sequenceSlug, oakSubject);
        for (const k of s.keyStages ?? []) kss.add(k.keyStageSlug);
      }
      const ksList = KEY_STAGES.filter((k) => (kss.size ? kss.has(k) : true) && (!ksFilter || ksFilter.includes(k)));
      for (const ks of ksList) await ing.keyStageSubject(ks, oakSubject, subjectId);
    }

    if (deps.sequenceQuestions ?? true) {
      for (const [seq, oakSubject] of sequences) {
        const subjectId = OAK_SUBJECT_MAP[oakSubject];
        const ckey = `seqbank:${seq}`;
        if (!force && ctx.isDone(ckey)) continue;
        const page = await client.paged<OakLessonQuestions>(`/sequences/${seq}/questions`, (p) => p.length);
        await ing.storeBank(page.items, page.urls[0] ?? `${OAK_API_BASE}/sequences/${seq}/questions`, page.checksums[0] ?? null, subjectId, null);
        await ctx.markDone(ckey, now());
      }
    }

    const warns = ctx.getStats().log_warn ?? 0;
    await ctx.log("info", "done", `Oak API ingest finished: ${client.requests} requests, ${warns} warnings`);
    return await done("ok");
  } catch (e) {
    if (e instanceof BlockedHostError) {
      await ctx.log("warn", "host_blocked", `${e.host} is not reachable from this environment (network policy or DNS); run the ingest where ${e.host} is allowed.`, { host: e.host });
      return await done("blocked", `host ${e.host} blocked`);
    }
    if (e instanceof StopRun) {
      await ctx.log("warn", e.code, e.message);
      return await done(e.status, e.message);
    }
    await ctx.log("error", "exception", String((e as Error).stack ?? e));
    await ctx.finish("failed", String(e));
    throw e;
  }
}

// ---------------------------------------------------------------- walking + writing

class Ingestor {
  /** content hashes of every lesson-quiz / bank question already stored (for batch dedupe) */
  private hashes = new Set<string>();
  private unitCache = new Map<string, Row | undefined>();
  private restricted = new Map<string, boolean>();

  constructor(private ctx: IngestContext, private client: OakClient, private store: DataStore, private force: boolean) {}

  async loadHashes() {
    const rows = await this.store.select<{ prompt_extra_json: string | null }>("questions", { where: { source_id: "oak_api" }, columns: ["prompt_extra_json"] });
    for (const r of rows) {
      try {
        const h = JSON.parse(r.prompt_extra_json ?? "{}").oak_content_hash;
        if (h) this.hashes.add(h);
      } catch {
        /* ignore */
      }
    }
  }

  private attribution(subjectId: string) {
    return OAK_ATTRIBUTION(subjectName(subjectId).toLowerCase());
  }

  private async unit(unitId: string | null) {
    if (!unitId) return undefined;
    if (!this.unitCache.has(unitId)) this.unitCache.set(unitId, await this.store.first("units", { where: { id: unitId } }));
    return this.unitCache.get(unitId);
  }

  async keyStageSubject(ks: string, oakSubject: string, subjectId: string) {
    const ctx = this.ctx;
    const base = `/key-stages/${ks}/subject/${oakSubject}`;
    // check-restricted returns an object map { lessonSlug: "ogl-compatible" | "restricted" }, paginated by offset/limit.
    for (let offset = 0; ; offset += PAGE) {
      const r = await this.client.json<OakRestrictions>(`${base}/check-restricted?offset=${offset}&limit=${PAGE}`);
      const map = r.status === 200 && r.data && !Array.isArray(r.data) ? r.data : {};
      if (r.status !== 200 && r.status !== 404) await ctx.log("warn", "restrictions_failed", `HTTP ${r.status} for ${r.url}`);
      for (const [slug, v] of Object.entries(map)) {
        this.restricted.set(slug, v === "restricted");
        if (v === "restricted") ctx.bump("restricted_listed");
      }
      const link = r.headers["link"];
      if (link !== undefined ? !hasNextLink(link) : Object.keys(map).length < PAGE) break;
    }

    const listing = await this.client.paged<OakKsSubjectLessons>(`${base}/lessons`, (p) => p.reduce((n, u) => n + (u.lessons?.length ?? 0), 0));
    const seen = new Set<string>();
    let pos = 0;
    for (const u of listing.items) {
      for (const l of u.lessons ?? []) {
        pos++;
        if (seen.has(l.lessonSlug)) continue;
        seen.add(l.lessonSlug);
        const ckey = `lesson:${l.lessonSlug}`;
        if (!this.force && ctx.isDone(ckey)) {
          ctx.bump("lessons_skipped_checkpoint");
          continue;
        }
        await this.lesson(l.lessonSlug, l.lessonTitle, u.unitSlug, u.unitTitle, ks, subjectId, pos);
        await ctx.markDone(ckey, now());
      }
    }

    const bkey = `bank:${ks}:${oakSubject}`;
    if (this.force || !ctx.isDone(bkey)) {
      const page = await this.client.paged<OakLessonQuestions>(`${base}/questions`, (p) => p.length);
      await this.storeBank(page.items, page.urls[0] ?? `${OAK_API_BASE}${base}/questions`, page.checksums[0] ?? null, subjectId, ks);
      await ctx.markDone(bkey, now());
    }
  }

  private async lesson(slug: string, title: string, unitSlug: string, unitTitle: string, ks: string, subjectId: string, sort: number) {
    const ctx = this.ctx;
    const c = this.client;
    const lessonId = lessonIdFor(slug);
    const attribution = this.attribution(subjectId);
    let restricted = this.restricted.get(slug) === true;

    const summary = await c.json<OakLessonSummary>(`/lessons/${slug}/summary`);
    const transcript = await c.json<OakTranscript>(`/lessons/${slug}/transcript`);
    const assets = await c.json<OakAssets>(`/lessons/${slug}/assets`);
    const quiz = await c.json<OakQuizResponse>(`/lessons/${slug}/quiz`);
    for (const r of [summary, transcript, assets, quiz])
      if (r.status === 400 && isCopyrightBlock(r.text)) {
        restricted = true;
        ctx.bump("responses_blocked_copyright");
      } else if (r.status >= 400 && r.status !== 404) await ctx.log("warn", "lesson_fetch_failed", `HTTP ${r.status} for ${r.url}`, { lesson: slug });
    if (restricted) ctx.bump("lessons_third_party");
    if (summary.status === 404) await ctx.log("warn", "lesson_not_found", `Lesson ${slug} listed but summary 404`, { lesson: slug });

    const s = summary.status === 200 ? summary.data : null;
    const unitId = unitIdFor(unitSlug || s?.units?.[0]?.unitSlug || "unknown");
    const existing = await this.store.first("lessons", { where: { id: lessonId } });
    const effUnitId = (existing?.unit_id as string | null) ?? unitId;
    const unit = await this.unit(effUnitId);
    const prov = (r: { url: string; checksum: string }): ProvBlock => makeProv(r.url, r.checksum, attribution, restricted, now());

    const blocks: Row[] = [];
    if (s) blocks.push(...mapSummaryBlocks(slug, lessonId, effUnitId, s, prov(summary)));
    if (transcript.status === 200 && transcript.data) {
      const b = mapTranscriptBlock(slug, lessonId, effUnitId, transcript.data, prov(transcript));
      if (b) blocks.push(b);
    }
    let assetRows: Row[] = [];
    if (assets.status === 200 && assets.data) {
      const m = mapAssets(slug, lessonId, assets.data, prov(assets));
      assetRows = m.rows;
      if (m.thirdParty) ctx.bump("assets_third_party", m.rows.length);
    }
    let mapped: MappedQuestion[] = [];
    if (quiz.status === 200 && quiz.data) {
      const q = mapQuiz(
        quiz.data,
        { lessonId, subjectId, keyStageId: ks, yearGroupId: (unit?.year_group_id as string) ?? null, prov: prov(quiz), extra: { oak_lesson_slug: slug } },
        (kind, n) => `oakapi:${slug}:${kind}:${n}`,
      );
      mapped = q.mapped;
      for (const sk of q.skipped) await ctx.log("warn", "unsupported_question_type", `Lesson ${slug} ${sk.kind} Q${sk.position}: type ${sk.questionType} not stored`, sk);
    }
    for (const m of mapped) {
      if (m.issues.length)
        await ctx.log("warn", "quiz_inconsistent", `Question ${m.question.id}: ${m.issues.join(", ")} (stored as needs_review, not corrected)`, { question_id: m.question.id, issues: m.issues });
      ctx.bump(`questions_${m.question.review_status}`);
    }

    // Unit statement links for question_statement_links
    const unitIds = new Set<string>([effUnitId]);
    for (const ul of await this.store.select<{ unit_id: string }>("unit_lessons", { where: { lesson_id: lessonId }, columns: ["unit_id"] })) unitIds.add(ul.unit_id);
    const unitLinks = await this.store.select<{ statement_id: string; confidence: number; review_status: string }>("unit_statement_links", {
      where: { unit_id: [...unitIds], method: "oak_mapping" },
    });

    await this.store.transaction(async () => {
      // replace this lesson's previous oak_api rows (idempotent re-ingest)
      const oldQ = await this.store.select<{ id: string }>("questions", {
        where: { lesson_id: lessonId, source_id: "oak_api", quiz_kind: ["starter", "exit"] },
        columns: ["id"],
      });
      await this.deleteQuestions(oldQ.map((q) => q.id));
      await this.store.delete("content_blocks", { lesson_id: lessonId, source_id: "oak_api" });
      await this.store.delete("assets", { lesson_id: lessonId, source_id: "oak_api" });

      if (!unit && effUnitId) {
        await this.store.upsert(
          "units",
          { id: effUnitId, subject_id: subjectId, key_stage_id: ks, slug: effUnitId.replace(/^oak:unit:/, ""), title: unitTitle || effUnitId, sort: 0, ...makeProv(`${OAK_API_BASE}/key-stages/${ks}/subject`, null, attribution, false, now()) },
          ["id"],
        );
        this.unitCache.delete(effUnitId);
        ctx.bump("units_created");
      }
      const merge = mergeLesson(
        existing,
        {
          id: lessonId,
          slug,
          title: s?.lessonTitle || title,
          unitId: effUnitId,
          pupilOutcome: s?.pupilLessonOutcome?.trim() || null,
          externalUrl: s?.canonicalUrl ?? s?.oakUrl ?? null,
          hasQuiz: mapped.length > 0,
          thirdParty: restricted,
          sort,
        },
        makeProv(summary.url, summary.checksum, attribution, restricted, now()),
      );
      if (merge.op === "insert") {
        await this.store.insert("lessons", merge.row);
        ctx.bump("lessons_created");
      } else if (Object.keys(merge.patch).length) {
        await this.store.update("lessons", { id: lessonId }, merge.patch);
        ctx.bump("lessons_updated");
      }
      for (const part of chunk(blocks, 500)) await this.store.upsert("content_blocks", part, ["id"]);
      for (const part of chunk(assetRows, 500)) await this.store.upsert("assets", part, ["id"]);
      await this.writeQuestions(mapped);
      const links = questionStatementLinks(mapped.map((m) => m.question.id as string), unitLinks);
      for (const part of chunk(links, 500)) await this.store.upsert("question_statement_links", part, ["question_id", "statement_id"]);
      ctx.bump("question_statement_links", links.length);
    });
    for (const m of mapped) this.hashes.add(m.contentHash);
    ctx.bump("lessons");
    ctx.bump("content_blocks", blocks.length);
    ctx.bump("assets", assetRows.length);
    ctx.bump("questions", mapped.length);
  }

  private async deleteQuestions(ids: string[]) {
    for (const part of chunk(ids, 400)) {
      if (!part.length) continue;
      await this.store.delete("question_options", { question_id: part });
      await this.store.delete("accepted_answers", { question_id: part });
      await this.store.delete("question_statement_links", { question_id: part });
      await this.store.delete("questions", { id: part });
    }
  }

  private async writeQuestions(mapped: MappedQuestion[]) {
    const qs = mapped.map((m) => m.question);
    const opts = mapped.flatMap((m) => m.options);
    const ans = mapped.flatMap((m) => m.answers);
    // options/answers of an upserted question are replaced wholesale
    const ids = qs.map((q) => q.id as string);
    for (const part of chunk(ids, 400)) {
      if (!part.length) continue;
      await this.store.delete("question_options", { question_id: part });
      await this.store.delete("accepted_answers", { question_id: part });
    }
    for (const part of chunk(qs, 500)) await this.store.upsert("questions", part, ["id"]);
    for (const part of chunk(opts, 1000)) await this.store.upsert("question_options", part, ["id"]);
    for (const part of chunk(ans, 1000)) await this.store.upsert("accepted_answers", part, ["id"]);
  }

  /** Batch question endpoints -> quiz_kind 'oak_question_bank', skipping anything already stored from a lesson quiz. */
  async storeBank(lessons: OakLessonQuestions[], url: string, checksum: string | null, subjectId: string, ks: string | null) {
    const ctx = this.ctx;
    const attribution = this.attribution(subjectId);
    const out: MappedQuestion[] = [];
    for (const l of lessons) {
      if (!l?.lessonSlug) continue;
      const lessonId = lessonIdFor(l.lessonSlug);
      const lesson = await this.store.first("lessons", { where: { id: lessonId }, columns: ["id", "unit_id"] });
      const unit = await this.unit((lesson?.unit_id as string) ?? null);
      const restricted = this.restricted.get(l.lessonSlug) === true;
      for (const [kind, list] of [
        ["starter", l.starterQuiz ?? []],
        ["exit", l.exitQuiz ?? []],
      ] as const) {
        for (let i = 0; i < list.length; i++) {
          const q = list[i];
          const h = questionContentHash(q);
          if (this.hashes.has(h)) {
            ctx.bump("bank_duplicates_skipped");
            continue;
          }
          const m = mapQuestion(q, {
            id: `oakapi:bank:${h.slice(0, 20)}`,
            lessonId: lesson ? lessonId : null,
            quizKind: "oak_question_bank",
            position: i + 1,
            subjectId,
            keyStageId: ks ?? ((unit?.key_stage_id as string) ?? null),
            yearGroupId: (unit?.year_group_id as string) ?? null,
            prov: makeProv(url, checksum, attribution, restricted, now()),
            extra: { oak_lesson_slug: l.lessonSlug, oak_quiz: kind },
          });
          if (!m) {
            await ctx.log("warn", "unsupported_question_type", `Bank ${l.lessonSlug} ${kind} Q${i + 1}: type ${q?.questionType} not stored`);
            continue;
          }
          if (m.issues.length)
            await ctx.log("warn", "quiz_inconsistent", `Question ${m.question.id}: ${m.issues.join(", ")} (stored as needs_review, not corrected)`, { question_id: m.question.id, issues: m.issues });
          this.hashes.add(h);
          out.push(m);
        }
      }
    }
    await this.store.transaction(async () => {
      await this.writeQuestions(out);
      // statement links through the lesson's unit
      for (const m of out) {
        const lid = m.question.lesson_id as string | null;
        if (!lid) continue;
        const lesson = await this.store.first("lessons", { where: { id: lid }, columns: ["unit_id"] });
        if (!lesson?.unit_id) continue;
        const unitLinks = await this.store.select<{ statement_id: string; confidence: number; review_status: string }>("unit_statement_links", {
          where: { unit_id: lesson.unit_id as string, method: "oak_mapping" },
        });
        const links = questionStatementLinks([m.question.id as string], unitLinks);
        if (links.length) await this.store.upsert("question_statement_links", links, ["question_id", "statement_id"]);
      }
    });
    ctx.bump("bank_questions", out.length);
  }
}
