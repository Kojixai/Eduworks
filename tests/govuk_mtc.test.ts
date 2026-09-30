import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SqliteStore } from "../src/lib/db/sqlite";
import { pdfText } from "../ingest/sources/govuk_common";
import { MTC_COLLECTION, ingestStaMtcGuidance, parseMtcRules } from "../ingest/sources/sta_mtc_guidance";
import {
  api,
  blockedFetcher,
  checkpointGuard,
  collection,
  htmlAtt,
  htmlPublication,
  lastRun,
  logs,
  makeFetcher,
  newStore,
  pdf,
  pdfAtt,
  publication,
} from "./fixtures/govuk/helpers";

const guard = checkpointGuard(["sta_mtc"]);
beforeAll(() => guard.save());
afterAll(() => guard.restore());
beforeEach(() => guard.clear());
afterEach(() => guard.clear());

describe("parseMtcRules", () => {
  it("extracts the check design from the framework PDF", () => {
    const hits = Object.fromEntries(parseMtcRules(pdfText(pdf("mtc_framework.pdf").file).join("\n")).map((h) => [h.key, h.value]));
    expect(hits).toEqual({
      yearGroup: "y4",
      questionCount: 25,
      secondsPerQuestion: 6,
      pauseSeconds: 3,
      practiceCount: 3,
      minTable: 2,
      maxTable: 12,
      excludedTables: [1],
      emphasisTables: [6, 7, 8, 9, 12],
      allowCommutativePairs: false,
      marksPerQuestion: 1,
    });
  });
  it("reads number words and alternative phrasings", () => {
    const hits = Object.fromEntries(
      parseMtcRules(
        "The check contains twenty-five questions. Pupils have a time limit of six seconds for each question. There is a pause of three seconds between questions. Questions are drawn from the multiplication tables from 2 to 12, up to 12 x 12.",
      ).map((h) => [h.key, h.value]),
    );
    expect(hits).toMatchObject({ questionCount: 25, secondsPerQuestion: 6, pauseSeconds: 3, minTable: 2, maxTable: 12, maxFactor: 12 });
  });
});

describe("ingestStaMtcGuidance", () => {
  let store: SqliteStore;
  beforeEach(async () => {
    store = await newStore();
  });
  afterEach(async () => store.close());

  const FW = "/government/publications/multiplication-tables-check-assessment-framework";
  const AG = "/government/publications/2024-multiplication-tables-check-administration-guidance";
  const AG_HTML = `${AG}/2024-multiplication-tables-check-administration-guidance`;
  function routes() {
    const fwPdf = pdfAtt("Multiplication tables check assessment framework", "MTC_assessment_framework.pdf");
    const welsh = pdfAtt("Multiplication tables check assessment framework (Welsh)", "MTC_framework_cy.pdf");
    return {
      [api(MTC_COLLECTION)]: collection(MTC_COLLECTION, "Multiplication tables check", [
        { base_path: FW, title: "Multiplication tables check assessment framework" },
        { base_path: "/government/publications/2023-multiplication-tables-check-administration-guidance", title: "2023 multiplication tables check administration guidance" },
        { base_path: AG, title: "2024 multiplication tables check administration guidance" },
      ]),
      [api(FW)]: publication(FW, "Multiplication tables check assessment framework", [fwPdf, welsh]),
      [fwPdf.url]: pdf("mtc_framework.pdf"),
      [api(AG)]: publication(AG, "2024 multiplication tables check administration guidance", [htmlAtt("2024 multiplication tables check administration guidance", AG_HTML)]),
      [api(AG_HTML)]: htmlPublication(
        AG_HTML,
        "2024 multiplication tables check administration guidance",
        `<h2 id="about-the-check">About the check</h2><p>The check window opens on 3 June.</p>
         <ul><li>Pupils will answer 25 questions.</li><li>Pupils have 6 seconds to answer each question.</li><li>There is a 2 second pause between questions.</li></ul>`,
      ),
    } as Record<string, never>;
  }

  it("writes verified rules over the unverified seed, warning on differences and source disagreement", async () => {
    await store.insert("assessment_rules", [
      { id: "mtc:questionCount", assessment: "mtc", rule_key: "questionCount", value: "25", verification_status: "unverified", source_id: "eduworks_original" },
      { id: "mtc:pauseSeconds", assessment: "mtc", rule_key: "pauseSeconds", value: "4", verification_status: "unverified", source_id: "eduworks_original" },
      { id: "mtc:emphasisTables", assessment: "mtc", rule_key: "emphasisTables", value: "[6,7,8,9,12]", verification_status: "unverified", source_id: "eduworks_original" },
      { id: "mtc:minEmphasisQuestions", assessment: "mtc", rule_key: "minEmphasisQuestions", value: "13", verification_status: "unverified", source_id: "eduworks_original" },
    ]);
    const { fetcher, requested } = makeFetcher(routes());
    await ingestStaMtcGuidance(store, { fetcher });
    expect(requested.some((u) => /2023-multiplication/.test(u))).toBe(false); // newest guidance only
    expect(requested.some((u) => /_cy\.pdf/.test(u))).toBe(false);
    const rules = Object.fromEntries(
      store.raw<{ id: string; rule_key: string; value: string; verification_status: string; source_url: string; source_id: string }>("SELECT * FROM assessment_rules WHERE assessment = 'mtc'").map((r) => [r.rule_key, r]),
    );
    expect(rules.questionCount).toMatchObject({ id: "mtc:questionCount", value: "25", verification_status: "verified", source_id: "sta_mtc" });
    expect(rules.questionCount.source_url).toMatch(/MTC_assessment_framework\.pdf$/);
    expect(rules.pauseSeconds).toMatchObject({ value: "3", verification_status: "verified" });
    expect(rules.emphasisTables.value).toBe("[6,7,8,9,12]");
    expect(rules.allowCommutativePairs.value).toBe("false");
    expect(rules.secondsPerQuestion.value).toBe("6");
    expect(rules.minTable.value).toBe("2");
    expect(rules.maxTable.value).toBe("12");
    expect(rules.excludedTables.value).toBe("[1]");
    expect(rules.minEmphasisQuestions).toMatchObject({ value: "13", verification_status: "unverified" }); // not stated: untouched

    const diff = logs(store, "sta_mtc", "value_differs");
    expect(diff).toHaveLength(1);
    expect(diff[0].level).toBe("warn");
    expect(diff[0].message).toContain("stored 4");
    expect(diff[0].message).toContain("gov.uk says 3");
    const dis = logs(store, "sta_mtc", "source_disagreement");
    expect(dis.map((d) => JSON.parse(d.context_json!).key)).toEqual(["pauseSeconds"]);
    expect((await lastRun(store, "sta_mtc")).status).toBe("ok");

    const n = await store.count("assessment_rules");
    await ingestStaMtcGuidance(store, { fetcher });
    expect(await store.count("assessment_rules")).toBe(n);
    expect(logs(store, "sta_mtc", "value_differs")).toHaveLength(1); // verified values now match
  });

  it("reuses a seeded snake_case key", async () => {
    await store.insert("assessment_rules", { id: "mtc:question_count", assessment: "mtc", rule_key: "question_count", value: "25", verification_status: "unverified" });
    const { fetcher } = makeFetcher(routes());
    await ingestStaMtcGuidance(store, { fetcher });
    expect(await store.count("assessment_rules", { id: "mtc:questionCount" })).toBe(0);
    expect((await store.first<{ verification_status: string }>("assessment_rules", { where: { id: "mtc:question_count" } }))!.verification_status).toBe("verified");
  });

  it("stops cleanly with host_blocked", async () => {
    await ingestStaMtcGuidance(store, { fetcher: blockedFetcher });
    expect((await lastRun(store, "sta_mtc")).status).toBe("blocked");
    expect(logs(store, "sta_mtc", "host_blocked")[0].message).toContain("www.gov.uk");
    expect(await store.count("assessment_rules")).toBe(0);
  });
});
