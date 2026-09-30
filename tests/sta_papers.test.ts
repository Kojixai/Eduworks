/**
 * STA past-paper ingester, end to end against SYNTHETIC PDFs (tests/fixtures/sta/build_fixtures.py)
 * that mimic STA layouts. gov.uk is faked through the deps hooks; no network.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../src/lib/db/sqlite";
import { CHECKPOINT_DIR, sha256, type IngestContext } from "../ingest/core/context";
import type { GovukContent } from "../ingest/core/govuk";
import { BlockedHostError } from "../ingest/core/http";
import { ingestStaPapers, type StaDeps, type StaOptions } from "../ingest/sources/sta_papers";
import { COLLECTION_PATH } from "../ingest/sources/sta_papers_discovery";

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sta-test-"));
const FX = path.join(TMP, "fx");
const CKPT = path.join(CHECKPOINT_DIR, "sta_ks2.json");
let savedCheckpoint: string | null = null;

const ASSETS = "https://assets.publishing.service.gov.uk/media/test";
const URLS = {
  arith: `${ASSETS}/2019_KS2_mathematics_paper1_arithmetic.pdf`,
  reasoning: `${ASSETS}/2019_KS2_mathematics_paper2_reasoning.pdf`,
  ms: `${ASSETS}/2019_KS2_mathematics_mark_schemes.pdf`,
  copyright: `${ASSETS}/2019_KS2_copyright_report.pdf`,
  modified: `${ASSETS}/2019_KS2_mathematics_paper1_MLP.pdf`,
  admin: `${ASSETS}/2019_KS2_administration_guidance.pdf`,
};
const PUB = "/government/publications/key-stage-2-tests-2019-mathematics-test-materials";

function govuk(): Record<string, GovukContent> {
  const att = (title: string, url: string) => ({ title, url, content_type: "application/pdf" });
  return {
    [COLLECTION_PATH]: {
      base_path: COLLECTION_PATH,
      title: "National curriculum assessments: past test materials",
      document_type: "document_collection",
      details: {},
      links: {
        documents: [
          { base_path: PUB, title: "Key stage 2 tests: 2019 mathematics test materials" },
          { base_path: "/government/publications/key-stage-1-tests-2019-mathematics-test-materials", title: "Key stage 1 tests: 2019 mathematics test materials" },
          { base_path: "/government/publications/multiplication-tables-check-guidance", title: "Multiplication tables check guidance" },
        ],
      },
    },
    [PUB]: {
      base_path: PUB,
      title: "Key stage 2 tests: 2019 mathematics test materials",
      document_type: "guidance",
      details: {
        attachments: [
          att("2019 key stage 2 mathematics Paper 1: arithmetic", URLS.arith),
          att("2019 key stage 2 mathematics Paper 2: reasoning", URLS.reasoning),
          att("2019 key stage 2 mathematics: mark schemes", URLS.ms),
          att("2019 key stage 2 mathematics Paper 1: arithmetic – modified large print", URLS.modified),
          att("2019 key stage 2 tests: copyright report", URLS.copyright),
          att("Key stage 2 tests: administration guidance", URLS.admin),
        ],
      },
      links: {},
    },
  };
}

interface Harness {
  store: SqliteStore;
  opts: StaOptions;
  fetched: string[];
}

async function harness(over: { msFile?: string; fetchFail?: (url: string) => Error | null; getContent?: StaDeps["getContent"] } = {}): Promise<Harness> {
  const store = new SqliteStore(":memory:");
  await store.migrate();
  await seedStatements(store);
  const fetched: string[] = [];
  const files: Record<string, string> = {
    [URLS.arith]: path.join(FX, "arith.pdf"),
    [URLS.reasoning]: path.join(FX, "reasoning.pdf"),
    [URLS.ms]: path.join(FX, over.msFile ?? "ms.pdf"),
    [URLS.copyright]: path.join(FX, "copyright.pdf"),
  };
  const content = govuk();
  const deps: StaDeps = {
    getContent:
      over.getContent ??
      (async (p: string) => {
        const c = content[p];
        if (!c) throw new Error(`404 ${p}`);
        return c;
      }),
    fetchPdf: async (ctx: IngestContext, url: string) => {
      const err = over.fetchFail?.(url);
      if (err) throw err;
      fetched.push(url);
      const f = files[url];
      if (!f) throw new Error(`unexpected download ${url}`);
      const body = fs.readFileSync(f);
      await ctx.registerRaw(url, f, body);
      return { path: f, checksum: sha256(body) };
    },
  };
  const run = fs.mkdtempSync(path.join(TMP, "run-"));
  return {
    store,
    fetched,
    opts: {
      keyStage: "ks2",
      manifestDir: path.join(run, "sta"),
      publicDir: path.join(run, "public"),
      workDir: path.join(run, "work"),
      deps,
    },
  };
}

/** A handful of NC statements shaped like the nc2014 rows in the real DB. */
async function seedStatements(store: SqliteStore) {
  const rows: Array<[string, string, string, string[], string]> = [
    ["st-y5-frac-1", "ks2", "Fractions (including decimals and percentages)", ["y5"], "Compare and order fractions whose denominators are all multiples of the same number."],
    ["st-y5-frac-2", "ks2", "Fractions (including decimals and percentages)", ["y5"], "Read and write decimal numbers as fractions."],
    ["st-y6-frac-1", "ks2", "Fractions (including decimals and percentages)", ["y6"], "Multiply simple pairs of proper fractions."],
    ["st-y3-add-1", "ks2", "Addition and subtraction", ["y3"], "Add and subtract numbers mentally."],
    ["st-y3-mul-1", "ks2", "Multiplication and division", ["y3"], "Recall and use multiplication and division facts for the 3, 4 and 8 multiplication tables."],
    ["st-y4-mul-1", "ks2", "Multiplication and division", ["y4"], "Recall multiplication and division facts for multiplication tables up to 12 × 12."],
  ];
  await store.insert(
    "curriculum_statements",
    rows.map(([id, ks, sub, ys, text], i) => ({
      id,
      subject_id: "mathematics",
      key_stage_id: ks,
      level: "statement",
      strand: "Number",
      sub_strand: sub,
      year_groups_json: JSON.stringify(ys),
      text,
      framework: "nc2014",
      sort: i,
    })),
  );
}

beforeAll(() => {
  execFileSync("python3", [path.join(ROOT, "tests/fixtures/sta/build_fixtures.py"), FX]);
  savedCheckpoint = fs.existsSync(CKPT) ? fs.readFileSync(CKPT, "utf8") : null;
}, 60_000);
beforeEach(() => fs.rmSync(CKPT, { force: true }));
afterEach(() => fs.rmSync(CKPT, { force: true }));
afterAll(() => {
  if (savedCheckpoint !== null) fs.writeFileSync(CKPT, savedCheckpoint);
  fs.rmSync(TMP, { recursive: true, force: true });
});

type AnyRow = Record<string, any>;

describe("STA papers ingester (synthetic KS2 2019 maths)", () => {
  let h: Harness;
  let res: Awaited<ReturnType<typeof ingestStaPapers>>;
  beforeAll(async () => {
    fs.rmSync(CKPT, { force: true });
    h = await harness();
    res = await ingestStaPapers(h.store, h.opts);
  }, 120_000);

  it("discovers and classifies attachments into a manifest (modified/admin ignored, KS1 filtered)", () => {
    expect(res.status).toBe("ok");
    const m = JSON.parse(fs.readFileSync(path.join(h.opts.manifestDir!, "manifest-ks2.json"), "utf8"));
    const kinds = m.entries.map((e: AnyRow) => `${e.year}:${e.kind}:${e.paper_number}`).sort();
    expect(kinds).toEqual(["2019:copyright_report:null", "2019:mark_scheme:null", "2019:maths_arithmetic:1", "2019:maths_reasoning:2"]);
    expect(m.entries.every((e: AnyRow) => e.url && e.title && e.year === 2019)).toBe(true);
    expect(h.fetched).not.toContain(URLS.modified);
  });

  it("detects every arithmetic question, its marks and a small crop", async () => {
    const paper = (await h.store.first<AnyRow>("papers", { where: { paper_code: "ks2-2019-maths-p1-arithmetic" } }))!;
    expect(paper).toMatchObject({ kind: "official", key_stage_id: "ks2", subject_id: "mathematics", year: 2019, total_marks: 40, time_allowed_minutes: 30, question_count: 36 });
    expect(paper.validation_status).toBe("passed");
    const v = JSON.parse(paper.validation_json);
    expect(v.checks.find((c: AnyRow) => c.id === "marks_total")).toMatchObject({ ok: true, mark_scheme_sum: 40, margin_sum: 40, total_source: "known_total" });
    expect(v.checks.find((c: AnyRow) => c.id === "arithmetic_recomputed")).toMatchObject({ ok: true, verified: 36 });
    const qs = await h.store.select<AnyRow>("questions", { where: { paper_id: paper.id }, orderBy: [["sort", "asc"]] });
    expect(qs.map((q) => q.number)).toEqual(Array.from({ length: 36 }, (_, i) => String(i + 1)));
    expect(qs.reduce((s, q) => s + q.marks, 0)).toBe(40);
    expect(qs.every((q) => q.qtype === "numeric" && q.review_status === "auto_ok" && q.extraction_confidence >= 0.9)).toBe(true);
    expect(qs[0].prompt_text).toBe("345 + 211 =");
    expect(qs[8].prompt_text).toBe("3/4 of 12 ="); // stacked fraction rebuilt
    const img = JSON.parse(qs[0].prompt_images_json)[0];
    expect(img.path).toBe("/question-images/sta/ks2/2019/maths-p1-arithmetic/q1.png");
    const png = path.join(h.opts.publicDir!, img.path);
    expect(fs.existsSync(png)).toBe(true);
    expect(fs.readFileSync(png).readUInt32BE(16)).toBeLessThanOrEqual(1000); // PNG IHDR width
    expect(fs.statSync(png).size).toBeLessThan(60_000);
    expect(await h.store.count("assets", { paper_id: paper.id, kind: "page_crop" })).toBe(36);
  });

  it("takes answers only from the mark scheme, with the listed alternatives and equivalence rules", async () => {
    const ans = async (n: number) =>
      (await h.store.select<AnyRow>("accepted_answers", { where: { question_id: `sta:ks2-2019-maths-p1-arithmetic:q${n}` }, orderBy: [["id", "asc"]] })).map((a) => `${a.answer}|${a.kind}`);
    expect(await ans(5)).toEqual(["4,725|numeric"]);
    expect(await ans(11)).toEqual(["3/4|fraction", "0.75|numeric"]);
    expect(await ans(12)).toEqual(["5/6|numeric"]); // equivalent fractions only: no decimals
    expect(await ans(16)).toEqual(["0.25|numeric", "1/4|exact"]);
    expect(await ans(21)).toEqual(["2 1/4|fraction", "2.25|numeric", "9/4|fraction"]);
    const q33 = (await h.store.first<AnyRow>("questions", { where: { id: "sta:ks2-2019-maths-p1-arithmetic:q33" } }))!;
    expect(q33).toMatchObject({ qtype: "numeric", marks: 2 });
    expect(q33.review_notes).toMatch(/method marks/i);
    expect(await ans(33)).toEqual(["71,318|numeric"]);
    const ms = (await h.store.first<AnyRow>("mark_scheme_entries", { where: { question_id: q33.id } }))!;
    expect(ms.guidance).toMatch(/formal method of long multiplication/);
    expect(ms.content_domain_ref).toBe("6C7a");
  });

  it("records provenance on every row", async () => {
    const arithSha = sha256(fs.readFileSync(path.join(FX, "arith.pdf")));
    const q = (await h.store.first<AnyRow>("questions", { where: { id: "sta:ks2-2019-maths-p1-arithmetic:q1" } }))!;
    expect(q).toMatchObject({ source_id: "sta_ks2", source_url: URLS.arith, licence_id: "OGL-3.0", checksum: arithSha, third_party_flag: 0 });
    expect(q.attribution_text).toBe(
      "Contains public sector information licensed under the Open Government Licence v3.0. 2019 key stage 2 mathematics test materials, Standards and Testing Agency.",
    );
    const ms = (await h.store.first<AnyRow>("mark_scheme_entries", { where: { question_id: q.id } }))!;
    expect(ms.source_url).toBe(URLS.ms);
    expect(await h.store.count("raw_files", { source_id: "sta_ks2" })).toBe(4);
  });

  it("types reasoning questions as self_mark and flags third-party questions from the copyright report", async () => {
    const paper = (await h.store.first<AnyRow>("papers", { where: { paper_code: "ks2-2019-maths-p2-reasoning" } }))!;
    expect(paper).toMatchObject({ question_count: 20, total_marks: 35, time_allowed_minutes: 40, third_party_flag: 1, licence_id: "OGL-3.0", validation_status: "passed" });
    const qs = await h.store.select<AnyRow>("questions", { where: { paper_id: paper.id } });
    expect(qs.every((q) => q.qtype === "self_mark" && q.review_status === "needs_review")).toBe(true);
    const q7 = qs.find((q) => q.number === "7")!;
    expect(q7).toMatchObject({ third_party_flag: 1, licence_id: "CROWN-THIRD-PARTY", marks: 2, prompt_images_json: null });
    expect(fs.existsSync(path.join(h.opts.publicDir!, "question-images/sta/ks2/2019/maths-p2-reasoning/q7.png"))).toBe(false);
    expect(await h.store.count("mark_scheme_entries", { question_id: q7.id })).toBe(2); // 7a + 7b
    expect(qs.filter((q) => q.third_party_flag === 1).map((q) => q.number)).toEqual(["7"]);
    const arith = (await h.store.first<AnyRow>("papers", { where: { paper_code: "ks2-2019-maths-p1-arithmetic" } }))!;
    expect(arith.third_party_flag).toBe(0);
  });

  it("maps content domain references to NC statements of that year and sub-strand", async () => {
    const links = async (n: number, paper = "p1-arithmetic") =>
      (await h.store.select<AnyRow>("question_statement_links", { where: { question_id: `sta:ks2-2019-maths-${paper}:q${n}` } }));
    const q9 = await links(9); // 5F10
    expect(q9.map((l) => l.statement_id).sort()).toEqual(["st-y5-frac-1", "st-y5-frac-2"]);
    expect(q9.every((l) => l.method === "sta_content_domain" && l.confidence === 0.7 && l.review_status === "needs_review")).toBe(true);
    expect((await links(1)).map((l) => l.statement_id)).toEqual(["st-y3-add-1"]); // 3C2 on "345 + 211": addition only
    expect((await links(3)).map((l) => l.statement_id)).toEqual(["st-y4-mul-1"]); // 4C6a on "7 × 8"
  });
});

describe("arithmetic check", () => {
  it("flags a mark scheme answer that disagrees with the computed value and keeps it unchanged", async () => {
    const h = await harness({ msFile: "ms_wrong.pdf" });
    const res = await ingestStaPapers(h.store, h.opts);
    expect(res.status).toBe("ok");
    const q5 = (await h.store.first<AnyRow>("questions", { where: { id: "sta:ks2-2019-maths-p1-arithmetic:q5" } }))!;
    expect(q5.review_status).toBe("needs_review");
    expect(q5.review_notes).toMatch(/computes to 4725/);
    const a = await h.store.select<AnyRow>("accepted_answers", { where: { question_id: q5.id } });
    expect(a.map((x) => x.answer)).toEqual(["4,752"]);
    const paper = (await h.store.first<AnyRow>("papers", { where: { paper_code: "ks2-2019-maths-p1-arithmetic" } }))!;
    expect(paper.validation_status).toBe("failed");
    const logs = await h.store.select<AnyRow>("ingest_logs", { where: { code: "arithmetic_mismatch" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("error");
    // other questions of a failed paper are no longer auto_ok
    const q1 = (await h.store.first<AnyRow>("questions", { where: { id: "sta:ks2-2019-maths-p1-arithmetic:q1" } }))!;
    expect(q1.review_status).toBe("needs_review");
  }, 120_000);
});

describe("resumability and idempotency", () => {
  it("resumes per paper from checkpoints and re-ingests without duplicates", async () => {
    let failReasoning = true;
    const h = await harness({ fetchFail: (u) => (failReasoning && u === URLS.reasoning ? new Error("simulated interruption") : null) });
    const r1 = await ingestStaPapers(h.store, h.opts);
    expect(r1.status).toBe("partial");
    expect(r1.failed).toEqual(["ks2-2019-maths-p2-reasoning"]);
    expect(await h.store.count("questions")).toBe(36);

    failReasoning = false;
    h.fetched.length = 0;
    const r2 = await ingestStaPapers(h.store, h.opts);
    expect(r2).toMatchObject({ status: "ok", papers: 1, skipped: 1 });
    expect(h.fetched).not.toContain(URLS.arith);
    expect(await h.store.count("questions")).toBe(56);

    const counts = async () =>
      Object.fromEntries(
        await Promise.all(
          ["papers", "questions", "accepted_answers", "mark_scheme_entries", "assets", "question_statement_links"].map(async (t) => [t, await h.store.count(t)]),
        ),
      );
    const before = await counts();
    const r3 = await ingestStaPapers(h.store, { ...h.opts, force: true });
    expect(r3).toMatchObject({ status: "ok", papers: 2, skipped: 0 });
    expect(await counts()).toEqual(before);
  }, 180_000);
});

describe("blocked hosts", () => {
  it("logs host_blocked and finishes the run as blocked when gov.uk discovery is blocked", async () => {
    const h = await harness({
      getContent: async () => {
        throw new BlockedHostError("www.gov.uk");
      },
    });
    const res = await ingestStaPapers(h.store, h.opts);
    expect(res).toMatchObject({ status: "blocked", blockedHost: "www.gov.uk" });
    const run = (await h.store.first<AnyRow>("ingest_runs", { where: { source_id: "sta_ks2" } }))!;
    expect(run.status).toBe("blocked");
    const log = (await h.store.first<AnyRow>("ingest_logs", { where: { code: "host_blocked" } }))!;
    expect(log.level).toBe("error");
    expect(log.message).toContain("www.gov.uk");
  });

  it("falls back to the committed manifest and stops as blocked when PDF downloads are blocked", async () => {
    const ok = await harness();
    await ingestStaPapers(ok.store, { ...ok.opts, years: [1999] }); // discovery only: writes the manifest
    fs.rmSync(CKPT, { force: true });
    const h = await harness({
      getContent: async () => {
        throw new BlockedHostError("www.gov.uk");
      },
      fetchFail: () => new BlockedHostError("assets.publishing.service.gov.uk"),
    });
    const res = await ingestStaPapers(h.store, { ...h.opts, manifestDir: ok.opts.manifestDir, refreshManifest: true });
    expect(res).toMatchObject({ status: "blocked", blockedHost: "assets.publishing.service.gov.uk" });
    const logs = await h.store.select<AnyRow>("ingest_logs", { where: { code: "host_blocked" }, orderBy: [["created_at", "asc"]] });
    expect(logs.map((l) => l.level)).toEqual(["warn", "error"]);
    expect(await h.store.count("questions")).toBe(0);
  });
});
