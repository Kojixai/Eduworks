import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SqliteStore } from "../src/lib/db/sqlite";
import { htmlToBlocks, pdfToBlocks } from "../ingest/sources/govuk_common";
import {
  DFE_COLLECTIONS,
  KS5_NOTE,
  ingestDfeSubjectContent,
  parseSubjectContent,
  splitNumbering,
  subjectsInTitle,
} from "../ingest/sources/dfe_subject_content";
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

const guard = checkpointGuard(["dfe_subject_content"]);
beforeAll(() => guard.save());
afterAll(() => guard.restore());
beforeEach(() => guard.clear());
afterEach(() => guard.clear());

const GCSE = DFE_COLLECTIONS[0];
const AL = DFE_COLLECTIONS[1];

describe("subject content helpers", () => {
  it("maps publication titles to platform subjects", () => {
    expect(subjectsInTitle("GCSE mathematics")).toEqual([{ id: "mathematics", name: "mathematics" }]);
    expect(subjectsInTitle("GCE AS and A level biology, chemistry, physics and psychology").map((s) => s.id)).toEqual(["biology", "chemistry", "physics"]);
    expect(subjectsInTitle("GCSE combined science").map((s) => s.id)).toEqual(["science"]);
    expect(subjectsInTitle("GCSE computer science").map((s) => s.id)).toEqual(["computing"]);
    expect(subjectsInTitle("GCE AS and A level ancient history")).toEqual([]);
    expect(subjectsInTitle("GCSE economics")).toEqual([]);
  });
  it("splits the document's own numbering", () => {
    expect(splitNumbering("3.1 Students should be taught")).toEqual({ ref: "3.1", text: "Students should be taught" });
    expect(splitNumbering("12. The content")).toEqual({ ref: "12", text: "The content" });
    expect(splitNumbering("N1 order positive and negative integers")).toEqual({ ref: "N1", text: "order positive and negative integers" });
    expect(splitNumbering("(b) second item")).toEqual({ ref: "(b)", text: "second item" });
    expect(splitNumbering("2014 was the year")).toEqual({ ref: null, text: "2014 was the year" });
  });
});

describe("parseSubjectContent", () => {
  it("PDF -> content areas and numbered statements with hierarchy", () => {
    const rows = parseSubjectContent(pdfToBlocks(pdf("gcse_maths.pdf").file), {
      framework: "gcse_content", ks: "ks4", years: GCSE.years, subjects: [{ id: "mathematics", name: "mathematics" }], docSlug: "gcse-mathematics",
    });
    const find = (t: RegExp) => rows.find((r) => t.test(r.text))!;
    const intro = find(/^Introduction$/);
    expect(intro).toMatchObject({ level: "content_area", parent_id: null, strand: "Introduction" });
    const p1 = find(/^The GCSE subject content sets out/);
    expect(p1).toMatchObject({ level: "statement", ref: "1", parent_id: intro.id, key_stage_id: "ks4", framework: "gcse_content" });
    expect(p1.text).toMatch(/specifications in mathematics\.$/); // wrapped line merged
    const aims = find(/should enable students to:$/);
    expect(aims.ref).toBe("2");
    expect(rows.filter((r) => r.parent_id === aims.id).map((r) => r.text)).toEqual([
      "develop fluent knowledge, skills and understanding of mathematical methods",
      "acquire, select and apply mathematical techniques to solve problems",
    ]);
    const sc = find(/^Structure and calculation$/);
    expect(sc).toMatchObject({ level: "content_area", strand: "Subject content", sub_strand: "Number" });
    expect(rows.find((r) => r.parent_id === rows.find((x) => x.text === "Number")!.id)!.id).toBe(sc.id);
    expect(find(/^order positive and negative/)).toMatchObject({ ref: "N1", parent_id: sc.id, sub_strand: "Number > Structure and calculation" });
    expect(find(/^ab in place of/).parent_id).toBe(find(/^Students should be taught to use and interpret/).id);
    expect(find(/^Students should be taught to use and interpret/).ref).toBe("3.1");
    expect(JSON.parse(p1.year_groups_json)).toEqual(["y10", "y11"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("splits a multi-subject A level document and marks KS5 as structure only", () => {
    const rows = parseSubjectContent(pdfToBlocks(pdf("alevel_sciences.pdf").file), {
      framework: "alevel_content", ks: "ks5", years: AL.years, docSlug: "gce-as-and-a-level-sciences",
      subjects: subjectsInTitle("GCE AS and A level biology, chemistry, physics and psychology"),
    });
    expect(rows.some((r) => /This document sets out/.test(r.text))).toBe(false); // shared preface dropped
    expect(rows.filter((r) => r.subject_id === "biology").map((r) => r.ref ?? r.text)).toEqual(["Biology", "Knowledge and understanding", "2", "3"]);
    expect(rows.filter((r) => r.subject_id === "chemistry").map((r) => r.ref ?? r.text)).toEqual(["Chemistry", "Knowledge and understanding", "4"]);
    expect(rows.some((r) => /psychology/i.test(r.text))).toBe(false);
    expect(rows.every((r) => r.key_stage_id === "ks5" && r.notes === KS5_NOTE)).toBe(true);
    expect(rows[0].id).toBe("alevel_content:biology:gce-as-and-a-level-sciences:1");
  });

  it("HTML attachments use the same parser", () => {
    const html = `<h2 id="introduction">Introduction</h2><p>1. These GCSE specifications must build on the key stage 3 programme of study.</p>
      <h2 id="subject-content">Subject content</h2><h3>Knowledge</h3><p>2. Specifications must require students to:</p><ul><li>understand the origins of the Earth</li></ul>`;
    const rows = parseSubjectContent(htmlToBlocks(html), { framework: "gcse_content", ks: "ks4", years: GCSE.years, subjects: [{ id: "geography", name: "geography" }], docSlug: "gcse-geography" });
    expect(rows.map((r) => [r.level, r.ref, r.text.slice(0, 20)])).toEqual([
      ["content_area", null, "Introduction"],
      ["statement", "1", "These GCSE specifica"],
      ["content_area", null, "Subject content"],
      ["content_area", null, "Knowledge"],
      ["statement", "2", "Specifications must "],
      ["statement", null, "understand the origi"],
    ]);
    expect(rows[5].parent_id).toBe(rows[4].id);
  });
});

describe("ingestDfeSubjectContent", () => {
  let store: SqliteStore;
  beforeEach(async () => {
    store = await newStore();
  });
  afterEach(async () => store.close());

  function routes() {
    const gm = "/government/publications/gcse-mathematics-subject-content-and-assessment-objectives";
    const gg = "/government/publications/gcse-geography";
    const ggHtml = `${gg}/gcse-geography-subject-content`;
    const ge = "/government/publications/gcse-economics";
    const as = "/government/publications/gce-as-and-a-level-for-biology-chemistry-physics-and-psychology";
    const gmPdf = pdfAtt("Mathematics GCSE subject content and assessment objectives", "GCSE_mathematics_subject_content_and_assessment_objectives.pdf");
    const eq = pdfAtt("Mathematics GCSE: equality impact assessment", "equality.pdf");
    const asPdf = pdfAtt("Biology, chemistry, physics and psychology: AS and A level subject content", "A_level_science_subject_content.pdf");
    return {
      [api(GCSE.path)]: collection(GCSE.path, "GCSE subject content", [
        { base_path: gm, title: "GCSE mathematics" },
        { base_path: gg, title: "GCSE geography" },
        { base_path: ge, title: "GCSE economics" },
      ]),
      [api(gm)]: publication(gm, "GCSE mathematics", [eq, gmPdf]),
      [gmPdf.url]: pdf("gcse_maths.pdf"),
      [api(gg)]: publication(gg, "GCSE geography", [htmlAtt("Geography GCSE subject content", ggHtml)]),
      [api(ggHtml)]: htmlPublication(ggHtml, "Geography GCSE subject content", `<h2>Subject content</h2><p>1. Students should be taught about:</p><ul><li>the global distribution of biomes</li></ul>`),
      [api(AL.path)]: collection(AL.path, "GCE AS and A level subject content", [{ base_path: as, title: "GCE AS and A level biology, chemistry, physics and psychology" }]),
      [api(as)]: publication(as, "GCE AS and A level biology, chemistry, physics and psychology", [asPdf]),
      [asPdf.url]: pdf("alevel_sciences.pdf"),
    } as Record<string, never>;
  }

  it("discovers documents, stores taxonomy rows with provenance, skips unmapped subjects, is idempotent", async () => {
    const { fetcher, requested } = makeFetcher(routes());
    await ingestDfeSubjectContent(store, { fetcher });
    expect(requested.some((u) => /equality\.pdf/.test(u))).toBe(false);
    const count = (fw: string, subject?: string) => store.count("curriculum_statements", { framework: fw, subject_id: subject });
    expect(await count("gcse_content", "mathematics")).toBeGreaterThan(10);
    expect(await count("gcse_content", "geography")).toBe(3);
    expect(await count("alevel_content", "biology")).toBe(4);
    expect(await count("alevel_content", "chemistry")).toBe(3);
    expect(await count("alevel_content", "physics")).toBe(0);
    expect(logs(store, "dfe_subject_content", "subject_section_missing").map((l) => l.message)).toEqual([expect.stringContaining("physics")]);
    expect(logs(store, "dfe_subject_content", "subject_unmapped")).toHaveLength(1);
    const ks5 = store.raw<{ key_stage_id: string; notes: string; source_url: string; licence_id: string }>("SELECT * FROM curriculum_statements WHERE framework = 'alevel_content'");
    expect(ks5.every((r) => r.key_stage_id === "ks5" && r.notes === KS5_NOTE && r.licence_id === "OGL-3.0" && /A_level_science/.test(r.source_url))).toBe(true);
    expect(await store.count("questions")).toBe(0);
    expect((await lastRun(store, "dfe_subject_content")).status).toBe("ok");

    const total = await store.count("curriculum_statements");
    await ingestDfeSubjectContent(store, { fetcher });
    await ingestDfeSubjectContent(store, { fetcher, force: true });
    expect(await store.count("curriculum_statements")).toBe(total);
  });

  it("stops cleanly with host_blocked", async () => {
    await ingestDfeSubjectContent(store, { fetcher: blockedFetcher });
    expect((await lastRun(store, "dfe_subject_content")).status).toBe("blocked");
    expect(logs(store, "dfe_subject_content", "host_blocked")[0].message).toContain("www.gov.uk");
  });
});
