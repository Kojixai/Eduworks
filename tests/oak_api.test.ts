import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../src/lib/db/sqlite";
import { BlockedHostError } from "../ingest/core/http";
import { CHECKPOINT_DIR } from "../ingest/core/context";
import { ingestOakApi, readApiKey, type OakHttp, type OakHttpResponse } from "../ingest/sources/oak_api";
import { OAK_ATTRIBUTION } from "../ingest/sources/registry";
import {
  OAK_API_BASE,
  isNumericAnswer,
  mapAssets,
  mapQuestion,
  mapSummaryBlocks,
  makeProv,
  mergeLesson,
  parseDotEnv,
  questionContentHash,
  questionStatementLinks,
  type OakQuestion,
  type QuestionContext,
} from "../ingest/sources/oak_api_map";

const FIX = path.join(__dirname, "fixtures", "oak_api");
const fx = (p: string) => JSON.parse(fs.readFileSync(path.join(FIX, p), "utf8"));
const ATTR = OAK_ATTRIBUTION("maths");

// ---- checkpoint file isolation: IngestContext always writes data/checkpoints/oak_api.json ----
const CKPT = path.join(CHECKPOINT_DIR, "oak_api.json");
let ckptBackup: string | null = null;
beforeAll(() => {
  ckptBackup = fs.existsSync(CKPT) ? fs.readFileSync(CKPT, "utf8") : null;
});
afterAll(() => {
  if (ckptBackup !== null) fs.writeFileSync(CKPT, ckptBackup);
  else if (fs.existsSync(CKPT)) fs.unlinkSync(CKPT);
});
const clearCkpt = () => {
  if (fs.existsSync(CKPT)) fs.unlinkSync(CKPT);
};

let tmp: string;
beforeEach(() => {
  clearCkpt();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oakapi-"));
});
afterEach(() => {
  clearCkpt();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- fixture-backed fake API ----
function fakeHttp(opts: { key?: string; on429Once?: string } = {}) {
  const calls: string[] = [];
  let sent429 = false;
  const res = (status: number, body: unknown, headers: Record<string, string> = {}): OakHttpResponse => ({
    status,
    headers: { "content-type": "application/json", ...headers },
    body: Buffer.from(JSON.stringify(body)),
    url: "",
  });
  const http: OakHttp = {
    async request(method, url, o = {}) {
      calls.push(`${method} ${url}`);
      if (url.startsWith("https://open-api.thenational.academy/api/bulk")) return res(401, { message: "API token not provided or invalid", code: "UNAUTHORIZED" });
      const auth = o.headers?.authorization;
      if (auth !== `Bearer ${opts.key ?? "test-key"}`) return res(401, { message: "API token not provided or invalid", code: "UNAUTHORIZED" });
      const u = new URL(url);
      const p = u.pathname.replace(/^\/api\/v0\//, "");
      if (opts.on429Once && p === opts.on429Once && !sent429) {
        sent429 = true;
        return res(429, { message: "Rate limited exceeded", code: "TOO_MANY_REQUESTS" }, { "x-ratelimit-remaining": "0", "x-retry-after": String(Date.now() + 5000) });
      }
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const errFile = path.join(FIX, `${p}.error.json`);
      if (fs.existsSync(errFile)) {
        const e = JSON.parse(fs.readFileSync(errFile, "utf8"));
        return res(e.status, e.body);
      }
      const file = path.join(FIX, `${p}.json`);
      if (!fs.existsSync(file)) return res(404, { message: "Not found", code: "NOT_FOUND" });
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (offset > 0) return res(200, Array.isArray(data) ? [] : {});
      return res(200, data, { "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "900", "x-ratelimit-reset": String(Date.now() + 3600_000) });
    },
  };
  return { http, calls };
}

async function newStore() {
  const store = new SqliteStore(":memory:");
  await store.migrate();
  return store;
}

/** Pre-existing ontology data: unit, lesson (no pupil outcome, no quiz) and unit->NC links. */
async function seedOntology(store: SqliteStore) {
  const prov = { source_id: "oak_ontology", licence_id: "OGL-3.0", attribution_text: ATTR, third_party_flag: 0 };
  await store.insert("units", { id: "oak:unit:fractions", subject_id: "mathematics", key_stage_id: "ks2", year_group_id: "y4", slug: "fractions", title: "Fractions", ...prov });
  await store.insert("lessons", { id: "oak:lesson:adding-fractions", unit_id: "oak:unit:fractions", slug: "adding-fractions", title: "Adding fractions (ontology title)", pupil_outcome: null, has_quiz: 0, ...prov });
  await store.insert("curriculum_statements", { id: "nc:fractions-add", subject_id: "mathematics", key_stage_id: "ks2", level: "statement", text: "add and subtract fractions with the same denominator", framework: "nc2014" });
  await store.insert("curriculum_statements", { id: "nc:fractions-compare", subject_id: "mathematics", key_stage_id: "ks2", level: "statement", text: "compare and order unit fractions", framework: "nc2014" });
  await store.insert("unit_statement_links", { unit_id: "oak:unit:fractions", statement_id: "nc:fractions-add", method: "oak_mapping", confidence: 0.95, review_status: "auto_ok" });
  await store.insert("unit_statement_links", { unit_id: "oak:unit:fractions", statement_id: "nc:fractions-compare", method: "oak_mapping", confidence: 0.7, review_status: "needs_review" });
}

const deps = (http: OakHttp, extra: Record<string, unknown> = {}) => ({
  http,
  env: { OAK_API_KEY: "test-key" },
  rootDir: tmp,
  rawDir: path.join(tmp, "raw"),
  manifest: false,
  sleep: async () => {},
  ...extra,
});

const COUNT_TABLES = ["lessons", "units", "content_blocks", "assets", "questions", "question_options", "accepted_answers", "question_statement_links", "raw_files"];
async function counts(store: SqliteStore) {
  const out: Record<string, number> = {};
  for (const t of COUNT_TABLES) out[t] = await store.count(t);
  return out;
}

// ======================================================================== pure mapping

const qctx = (id = "q1"): QuestionContext => ({
  id,
  lessonId: "oak:lesson:x",
  quizKind: "starter",
  position: 1,
  subjectId: "mathematics",
  keyStageId: "ks2",
  yearGroupId: null,
  prov: makeProv(`${OAK_API_BASE}/lessons/x/quiz`, "abc", ATTR, false, "2026-01-01T00:00:00Z"),
});

describe("oak_api_map: question types", () => {
  const quiz = fx("lessons/adding-fractions/quiz.json");

  it("multiple-choice with one correct answer -> mcq, auto_ok", () => {
    const m = mapQuestion(quiz.starterQuiz[0], qctx())!;
    expect(m.question.qtype).toBe("mcq");
    expect(m.question.review_status).toBe("auto_ok");
    expect(m.question.extraction_confidence).toBe(1);
    expect(m.options.map((o) => [o.label, o.text, o.is_correct])).toEqual([
      ["A", "2/8", 0],
      ["B", "1/2", 1],
      ["C", "1/8", 0],
    ]);
    expect(m.question).toMatchObject({ marks: 1, sort: 1, quiz_kind: "starter", licence_id: "OGL-3.0", attribution_text: ATTR, checksum: "abc", third_party_flag: 0 });
  });

  it("multiple-choice with several correct answers -> multi_select", () => {
    const m = mapQuestion(quiz.starterQuiz[1], qctx())!;
    expect(m.question.qtype).toBe("multi_select");
    expect(m.options.filter((o) => o.is_correct === 1).map((o) => o.text)).toEqual(["2/4", "3/6"]);
    expect(m.question.review_status).toBe("auto_ok");
  });

  it("short-answer -> text_exact with every accepted answer; numeric-looking answers get kind numeric", () => {
    const frac = mapQuestion(quiz.starterQuiz[2], qctx())!;
    expect(frac.question.qtype).toBe("text_exact");
    expect(frac.answers.map((a) => [a.answer, a.kind])).toEqual([
      ["5/8", "exact"],
      ["five eighths", "exact"],
    ]);
    const num = mapQuestion(quiz.exitQuiz[0], qctx())!;
    expect(num.answers.map((a) => [a.answer, a.kind])).toEqual([
      ["4", "numeric"],
      ["four", "exact"],
    ]);
    expect(num.question.review_status).toBe("auto_ok");
    expect(isNumericAnswer("1,250")).toBe(true);
    expect(isNumericAnswer("-3.5")).toBe(true);
    expect(isNumericAnswer("3/4")).toBe(false);
    expect(isNumericAnswer("5cm")).toBe(false);
  });

  it("order -> ordering with correct_position", () => {
    const m = mapQuestion(quiz.exitQuiz[1], qctx())!;
    expect(m.question.qtype).toBe("ordering");
    expect(m.options.map((o) => [o.text, o.correct_position])).toEqual([
      ["1/2", 3],
      ["1/8", 1],
      ["1/4", 2],
    ]);
    expect(m.question.review_status).toBe("auto_ok");
  });

  it("match -> matching with L/R options sharing match_key", () => {
    const m = mapQuestion(quiz.exitQuiz[2], qctx())!;
    expect(m.question.qtype).toBe("matching");
    const L = m.options.filter((o) => o.side === "L");
    const R = m.options.filter((o) => o.side === "R");
    expect(L).toHaveLength(3);
    expect(R).toHaveLength(3);
    for (const l of L) expect(R.find((r) => r.match_key === l.match_key)).toBeTruthy();
    expect(R.find((r) => r.match_key === L.find((l) => l.text === "1/4")!.match_key)!.text).toBe("0.25");
  });

  it("images -> prompt_images_json and option image_path; image-only option needs review", () => {
    const m = mapQuestion(quiz.exitQuiz[3], qctx())!;
    expect(JSON.parse(m.question.prompt_images_json as string)[0]).toMatchObject({ path: expect.stringContaining("fraction-bars.png"), alt: "Two fraction bars" });
    expect(m.options[0]).toMatchObject({ text: "Bar A", image_path: expect.stringContaining("a.png"), is_correct: 1 });
    expect(m.options[1]).toMatchObject({ text: "", image_path: expect.stringContaining("b.png") });
    expect(m.question.review_status).toBe("needs_review");
    expect(m.question.extraction_confidence).toBe(0.8);
  });

  it("never invents answers: no correct option / duplicate order positions -> needs_review with issues", () => {
    const bad = fx("lessons/inconsistent-quiz-lesson/quiz.json");
    const m = mapQuestion(bad.starterQuiz[0], qctx())!;
    expect(m.question.qtype).toBe("mcq");
    expect(m.options.every((o) => o.is_correct === 0)).toBe(true);
    expect(m.issues).toContain("no_correct_option");
    expect(m.question.review_status).toBe("needs_review");
    expect(m.question.extraction_confidence).toBe(0.5);
    const o = mapQuestion(bad.exitQuiz[0], qctx())!;
    expect(o.issues).toContain("order_positions_not_1_to_n");
    expect(mapQuestion(bad.exitQuiz[1], qctx())).toBeNull(); // unsupported type
  });

  it("explanation/feedback is kept when present; third-party image attribution flags the question", () => {
    const q: OakQuestion = {
      question: "Which is bigger?",
      questionType: "multiple-choice",
      questionImage: { url: "https://x/img.png", width: 1, height: 1, attribution: "Photo: Someone, CC BY" },
      answers: [
        { type: "text", content: "a", distractor: false },
        { type: "text", content: "b", distractor: true },
      ],
      feedback: "Because a is bigger.",
    };
    const m = mapQuestion(q, qctx())!;
    expect(m.question.explanation).toBe("Because a is bigger.");
    expect(m.question.third_party_flag).toBe(1);
    expect(m.question.attribution_text).toContain("Photo: Someone");
  });

  it("content hash ignores whitespace/case but not answers", () => {
    const a = quiz.starterQuiz[0];
    const b = { ...a, question: "  what is 1/4 +   1/4? " };
    const c = { ...a, answers: a.answers.slice(0, 2) };
    expect(questionContentHash(a)).toBe(questionContentHash(b));
    expect(questionContentHash(a)).not.toBe(questionContentHash(c));
  });
});

describe("oak_api_map: blocks, assets, lessons, links, env", () => {
  const prov = makeProv("u", "c", ATTR, false, "t");
  it("summary -> content_blocks of each kind", () => {
    const rows = mapSummaryBlocks("adding-fractions", "oak:lesson:adding-fractions", "oak:unit:fractions", fx("lessons/adding-fractions/summary.json"), prov);
    const kinds = rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === "key_learning_point")).toHaveLength(2);
    expect(rows.find((r) => r.kind === "keyword")).toMatchObject({ id: "oakapi:adding-fractions:keyword:1", title: "denominator", source_id: "oak_api" });
    expect(rows.find((r) => r.kind === "misconception")!.body).toContain("bar model");
    expect(kinds).toContain("teacher_tip");
  });
  it("assets -> link rows; attribution flags third party; quiz PDFs skipped", () => {
    const a = mapAssets("adding-fractions", "l", fx("lessons/adding-fractions/assets.json"), prov);
    expect(a.rows.map((r) => r.kind).sort()).toEqual(["slides", "video", "worksheet", "worksheet_answers"]);
    expect(a.skippedTypes).toEqual(["starterQuiz"]);
    expect(a.thirdParty).toBe(false);
    const p = mapAssets("poems-about-numbers", "l", fx("lessons/poems-about-numbers/assets.json"), prov);
    expect(p.thirdParty).toBe(true);
    expect(p.rows[0].third_party_flag).toBe(1);
  });
  it("mergeLesson keeps existing data and only fills gaps", () => {
    const inc = { id: "l", slug: "l", title: "API title", unitId: "u", pupilOutcome: "I can.", externalUrl: "x", hasQuiz: true, thirdParty: false, sort: 1 };
    const m = mergeLesson({ id: "l", title: "Old", pupil_outcome: "", has_quiz: 0, unit_id: "u", external_url: "y" }, inc, prov);
    expect(m).toEqual({ op: "update", patch: { has_quiz: 1, pupil_outcome: "I can." } });
    const keep = mergeLesson({ id: "l", pupil_outcome: "Existing", has_quiz: 1, unit_id: "u", external_url: "y" }, inc, prov);
    expect(keep).toEqual({ op: "update", patch: {} });
    expect(mergeLesson(undefined, inc, prov).op).toBe("insert");
  });
  it("question links cap confidence at 0.9 and copy review status", () => {
    const rows = questionStatementLinks(["q"], [
      { statement_id: "s1", confidence: 0.95, review_status: "auto_ok" },
      { statement_id: "s2", confidence: 0.6, review_status: "needs_review" },
    ]);
    expect(rows).toEqual([
      { question_id: "q", statement_id: "s1", method: "oak_mapping", confidence: 0.9, review_status: "auto_ok" },
      { question_id: "q", statement_id: "s2", method: "oak_mapping", confidence: 0.6, review_status: "needs_review" },
    ]);
  });
  it("reads OAK_API_KEY from env, then .env.local, then .env", () => {
    expect(parseDotEnv(`# c\nexport OAK_API_KEY="abc" \nOTHER='x' # note`)).toEqual({ OAK_API_KEY: "abc", OTHER: "x" });
    expect(readApiKey({ OAK_API_KEY: "fromenv" }, tmp)).toEqual({ key: "fromenv", from: "environment" });
    expect(readApiKey({}, tmp).key).toBeNull();
    fs.writeFileSync(path.join(tmp, ".env"), "OAK_API_KEY=fromdotenv\n");
    expect(readApiKey({}, tmp)).toEqual({ key: "fromdotenv", from: ".env" });
    fs.writeFileSync(path.join(tmp, ".env.local"), "OAK_API_KEY=fromlocal\n");
    expect(readApiKey({}, tmp)).toEqual({ key: "fromlocal", from: ".env.local" });
  });
});

// ======================================================================== ingester

describe("ingestOakApi: blocked paths", () => {
  it("no key: probes the bulk download, logs no_api_key and finishes 'blocked' without throwing", async () => {
    const store = await newStore();
    const { http, calls } = fakeHttp();
    const r = await ingestOakApi(store, { ...deps(http), env: {} });
    expect(r.status).toBe("blocked");
    expect(calls).toEqual(["POST https://open-api.thenational.academy/api/bulk"]);
    const run = await store.first<{ status: string }>("ingest_runs", { where: { source_id: "oak_api" } });
    expect(run!.status).toBe("blocked");
    const log = await store.first<{ message: string; level: string }>("ingest_logs", { where: { code: "no_api_key" } });
    expect(log!.level).toBe("warn");
    expect(log!.message).toContain("OAK_API_KEY");
    expect(log!.message).toContain("401");
    expect(await store.count("questions")).toBe(0);
  });

  it("host blocked (no key and with key): finishes 'blocked' and names the host", async () => {
    const blocked: OakHttp = {
      async request(_m, url) {
        throw new BlockedHostError(new URL(url).host);
      },
    };
    for (const env of [{}, { OAK_API_KEY: "test-key" }]) {
      const store = await newStore();
      const r = await ingestOakApi(store, { ...deps(blocked), env });
      expect(r.status).toBe("blocked");
      const log = await store.first<{ message: string }>("ingest_logs", { where: { code: "host_blocked" } });
      expect(log!.message).toContain("open-api.thenational.academy");
    }
  });

  it("rejected key (401) finishes 'blocked'", async () => {
    const store = await newStore();
    const { http } = fakeHttp({ key: "other" });
    const r = await ingestOakApi(store, deps(http));
    expect(r.status).toBe("blocked");
    expect(await store.count("ingest_logs", { code: "invalid_api_key" })).toBe(1);
  });
});

describe("ingestOakApi: full run against fixtures", () => {
  it("maps lessons, blocks, assets, quizzes, bank questions and links", async () => {
    const store = await newStore();
    await seedOntology(store);
    const { http, calls } = fakeHttp();
    const r = await ingestOakApi(store, deps(http));
    expect(r.status).toBe("ok");
    expect(calls.every((c) => c.includes("/api/v0/"))).toBe(true);

    // lesson merge: ontology row kept, gaps filled
    const lesson = await store.first<Record<string, unknown>>("lessons", { where: { id: "oak:lesson:adding-fractions" } });
    expect(lesson).toMatchObject({ title: "Adding fractions (ontology title)", source_id: "oak_ontology", has_quiz: 1, pupil_outcome: "I can add fractions with the same denominator." });
    // lessons unknown to the ontology are created from the API
    const created = await store.first<Record<string, unknown>>("lessons", { where: { id: "oak:lesson:inconsistent-quiz-lesson" } });
    expect(created).toMatchObject({ source_id: "oak_api", unit_id: "oak:unit:fractions", has_quiz: 1 });

    // content blocks
    const blocks = await store.select<Record<string, unknown>>("content_blocks", { where: { lesson_id: "oak:lesson:adding-fractions" } });
    const kinds = new Set(blocks.map((b) => b.kind));
    for (const k of ["key_learning_point", "keyword", "misconception", "teacher_tip", "transcript"]) expect(kinds.has(k)).toBe(true);
    const tr = blocks.find((b) => b.kind === "transcript")!;
    expect(tr).toMatchObject({ id: "oakapi:adding-fractions:transcript:1", source_id: "oak_api", licence_id: "OGL-3.0", attribution_text: ATTR, source_url: `${OAK_API_BASE}/lessons/adding-fractions/transcript` });
    expect(String(tr.checksum)).toMatch(/^[0-9a-f]{64}$/);

    // assets (links only)
    const assets = await store.select<Record<string, unknown>>("assets", { where: { lesson_id: "oak:lesson:adding-fractions" } });
    expect(assets.map((a) => a.kind).sort()).toEqual(["slides", "video", "worksheet", "worksheet_answers"]);
    expect(assets.every((a) => a.local_path === null && String(a.url).startsWith(OAK_API_BASE))).toBe(true);

    // quizzes
    const qs = await store.select<Record<string, unknown>>("questions", { where: { lesson_id: "oak:lesson:adding-fractions" }, orderBy: [["id", "asc"]] });
    expect(qs.filter((q) => q.quiz_kind === "starter")).toHaveLength(3);
    expect(qs.filter((q) => q.quiz_kind === "exit")).toHaveLength(4);
    expect(qs.every((q) => q.year_group_id === "y4" && q.subject_id === "mathematics" && q.key_stage_id === "ks2")).toBe(true);
    expect(new Set(qs.map((q) => q.qtype))).toEqual(new Set(["mcq", "multi_select", "text_exact", "ordering", "matching"]));
    expect((await store.first<Record<string, unknown>>("questions", { where: { id: "oakapi:adding-fractions:exit:2" } }))!.sort).toBe(2);

    // question -> statement links from the unit's oak_mapping links
    const links = await store.select<Record<string, unknown>>("question_statement_links", { where: { question_id: "oakapi:adding-fractions:starter:1" } });
    expect(links.map((l) => [l.statement_id, l.confidence, l.review_status]).sort()).toEqual([
      ["nc:fractions-add", 0.9, "auto_ok"],
      ["nc:fractions-compare", 0.7, "needs_review"],
    ]);

    // inconsistent quiz: stored, needs_review, warned by id; unsupported type skipped with a warning
    const bad = await store.first<Record<string, unknown>>("questions", { where: { id: "oakapi:inconsistent-quiz-lesson:starter:1" } });
    expect(bad).toMatchObject({ review_status: "needs_review" });
    const warn = await store.first<{ message: string }>("ingest_logs", { where: { code: "quiz_inconsistent", message: { op: "like", value: "%inconsistent-quiz-lesson:starter:1%" } } });
    expect(warn!.message).toContain("no_correct_option");
    expect(await store.count("ingest_logs", { code: "unsupported_question_type" })).toBe(1);

    // bank: duplicates of lesson quizzes skipped; the new lesson's questions kept once
    const bank = await store.select<Record<string, unknown>>("questions", { where: { quiz_kind: "oak_question_bank" } });
    expect(bank).toHaveLength(2);
    expect(bank.every((q) => JSON.parse(String(q.prompt_extra_json)).oak_lesson_slug === "subtracting-fractions")).toBe(true);
    expect(bank.every((q) => q.lesson_id === null)).toBe(true);

    // raw responses recorded with url + sha256
    const raw = await store.first<Record<string, unknown>>("raw_files", { where: { url: `${OAK_API_BASE}/lessons/adding-fractions/quiz` } });
    expect(String(raw!.checksum_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(tmp, "raw"))).toBe(true);
  });

  it("flags restricted / third-party lessons and everything derived from them", async () => {
    const store = await newStore();
    const { http } = fakeHttp();
    await ingestOakApi(store, deps(http));
    const l = await store.first<Record<string, unknown>>("lessons", { where: { id: "oak:lesson:poems-about-numbers" } });
    expect(l!.third_party_flag).toBe(1);
    const q = await store.select<Record<string, unknown>>("questions", { where: { lesson_id: "oak:lesson:poems-about-numbers" } });
    expect(q.length).toBe(1);
    expect(q.every((x) => x.third_party_flag === 1)).toBe(true);
    const b = await store.select<Record<string, unknown>>("content_blocks", { where: { lesson_id: "oak:lesson:poems-about-numbers" } });
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((x) => x.third_party_flag === 1)).toBe(true);
    expect(b.some((x) => x.kind === "content_guidance")).toBe(true);
    expect(b.some((x) => x.kind === "transcript")).toBe(false); // blocked for copyright
    const a = await store.select<Record<string, unknown>>("assets", { where: { lesson_id: "oak:lesson:poems-about-numbers" } });
    expect(a[0]).toMatchObject({ third_party_flag: 1 });
    expect(String(a[0].attribution_text)).toContain("Example Poet");
    // an OGL lesson is not flagged
    const ok = await store.select<Record<string, unknown>>("questions", { where: { lesson_id: "oak:lesson:adding-fractions" } });
    expect(ok.every((x) => x.third_party_flag === 0 || String(x.attribution_text).includes("Images"))).toBe(true);
  });

  it("is resumable: a second run skips checkpointed lessons and batch pages", async () => {
    const store = await newStore();
    const first = fakeHttp();
    await ingestOakApi(store, deps(first.http));
    expect(first.calls.filter((c) => c.includes("/lessons/adding-fractions/"))).toHaveLength(4);
    const before = await counts(store);
    const second = fakeHttp();
    const r = await ingestOakApi(store, deps(second.http));
    expect(r.status).toBe("ok");
    expect(second.calls.some((c) => c.includes("/lessons/adding-fractions/"))).toBe(false);
    expect(second.calls.some((c) => c.includes("/questions"))).toBe(false);
    expect(r.stats.lessons_skipped_checkpoint).toBe(3);
    const after = await counts(store);
    expect({ ...after, raw_files: 0 }).toEqual({ ...before, raw_files: 0 });
  });

  it("is idempotent: a forced full rerun gives identical row counts", async () => {
    const store = await newStore();
    await seedOntology(store);
    await ingestOakApi(store, deps(fakeHttp().http));
    const a = await counts(store);
    const r = await ingestOakApi(store, deps(fakeHttp().http, { force: true }));
    expect(r.status).toBe("ok");
    expect(await counts(store)).toEqual(a);
    expect(a.questions).toBe(7 + 2 + 1 + 2); // adding-fractions + inconsistent (2 of 3) + poems + bank
  });

  it("backs off on 429 and stops 'partial' at the request budget", async () => {
    const store = await newStore();
    const waits: number[] = [];
    const { http } = fakeHttp({ on429Once: "lessons/adding-fractions/quiz" });
    const r = await ingestOakApi(store, deps(http, { sleep: async (ms: number) => void waits.push(ms) }));
    expect(r.status).toBe("ok");
    expect(waits.length).toBe(1);
    expect(r.stats.rate_limit_waits).toBe(1);
    expect(await store.count("questions", { lesson_id: "oak:lesson:adding-fractions" })).toBe(7);

    clearCkpt();
    const store2 = await newStore();
    const r2 = await ingestOakApi(store2, deps(fakeHttp().http, { maxRequests: 10 }));
    expect(r2.status).toBe("partial");
    expect(await store2.count("ingest_logs", { code: "request_budget" })).toBe(1);
  });
});
