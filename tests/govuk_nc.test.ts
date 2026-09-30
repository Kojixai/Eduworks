import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SqliteStore } from "../src/lib/db/sqlite";
import { htmlToBlocks } from "../ingest/sources/govuk_common";
import {
  NC_COLLECTION,
  NC_FRAMEWORK,
  ingestNcGovuk,
  keyStagesInTitle,
  parseContextHeading,
  parseProgrammeOfStudy,
  strandInitials,
} from "../ingest/sources/nc_govuk";
import {
  GOV,
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
  readFix,
} from "./fixtures/govuk/helpers";

const MA = { id: "mathematics", code: "MA" };
const guard = checkpointGuard(["nc_govuk"]);
beforeAll(() => guard.save());
afterAll(() => guard.restore());
beforeEach(() => guard.clear());
afterEach(() => guard.clear());

const PUB = (s: string) => `/government/publications/national-curriculum-in-england-${s}-programmes-of-study`;
const HTML = (s: string) => `${PUB(s)}/national-curriculum-in-england-${s}-programmes-of-study`;

function routes() {
  const subjects = [
    ["mathematics", "maths_body.html"],
    ["english", "english_body.html"],
    ["history", "history_body.html"],
  ];
  const r: Record<string, unknown> = {
    [api(NC_COLLECTION)]: collection(
      NC_COLLECTION,
      "National curriculum",
      subjects.map(([s]) => ({ base_path: PUB(s), title: `National curriculum in England: ${s} programmes of study` })),
    ),
  };
  for (const [s, file] of subjects) {
    const atts: Array<Record<string, unknown>> = [htmlAtt(`National curriculum in England: ${s} programmes of study`, HTML(s))];
    if (s === "mathematics") {
      atts.push(pdfAtt("Mathematics programmes of study: key stages 1 and 2", "PRIMARY_national_curriculum_-_Mathematics.pdf"));
      atts.push(pdfAtt("Mathematics programmes of study: key stage 4", "KS4_maths_PoS_FINAL.pdf"));
    }
    r[api(PUB(s))] = publication(PUB(s), `National curriculum in England: ${s} programmes of study`, atts);
    r[api(HTML(s))] = htmlPublication(HTML(s), `National curriculum in England: ${s} programmes of study`, readFix(`nc/${file}`));
  }
  const ks4 = (r[api(PUB("mathematics"))] as { details: { attachments: Array<{ url: string; title: string }> } }).details.attachments.find((a) => /key stage 4/.test(a.title))!;
  r[ks4.url] = pdf("nc_maths_ks4.pdf");
  return r as Record<string, never>;
}

describe("NC heading and reference helpers", () => {
  it("recognises key stage and year headings", () => {
    expect(parseContextHeading("Year 3 programme of study")!.ctx).toEqual([{ ks: "ks2", years: ["y3"], code: "Y3" }]);
    expect(parseContextHeading("Years 5 and 6 programme of study")!.ctx).toEqual([{ ks: "ks2", years: ["y5", "y6"], code: "Y5-6" }]);
    expect(parseContextHeading("Key stage 1 - years 1 and 2")!.ctx[0].code).toBe("KS1");
    expect(parseContextHeading("Key stage 3")!.ctx).toEqual([{ ks: "ks3", years: ["y7", "y8", "y9"], code: "KS3" }]);
    expect(parseContextHeading("Lower key stage 2 - years 3 and 4")!.ctx[0].code).toBe("Y3-4");
    const sl = parseContextHeading("Spoken language - years 1 to 6")!;
    expect(sl.lead).toBe("Spoken language");
    expect(sl.ctx.map((c) => c.code)).toEqual(["Y1-2", "Y3-6"]);
    expect(parseContextHeading("Number - number and place value")).toBeNull();
    expect(parseContextHeading("Statutory requirements")).toBeNull();
  });
  it("builds strand initials and reads key stages from attachment titles", () => {
    expect(strandInitials("Number - number and place value")).toBe("NPV");
    expect(strandInitials("Number – fractions (including decimals)")).toBe("FD");
    expect(strandInitials("Working scientifically")).toBe("WS");
    expect(keyStagesInTitle("Mathematics programmes of study: key stages 1 and 2")).toEqual(["ks1", "ks2"]);
    expect(keyStagesInTitle("Science programmes of study: key stage 4")).toEqual(["ks4"]);
    expect(keyStagesInTitle("English appendix 1: spelling")).toEqual([]);
  });
});

describe("parseProgrammeOfStudy (HTML)", () => {
  const rows = parseProgrammeOfStudy(htmlToBlocks(readFix("nc/maths_body.html")), MA);
  const byRef = new Map(rows.map((r) => [r.ref, r]));

  it("stores aims and ignores preamble", () => {
    const aims = rows.filter((r) => r.level === "aim");
    expect(aims.map((a) => a.ref)).toEqual(["MA.AIM.1", "MA.AIM.2", "MA.AIM.3"]);
    expect(aims[0].key_stage_id).toBeNull();
    expect(rows.some((r) => /creative and highly inter-connected/.test(r.text))).toBe(false);
    expect(rows.some((r) => /principal focus/.test(r.text))).toBe(false);
  });

  it("gives per-year statements with strand, year group and stable refs", () => {
    const s = byRef.get("MA.Y3.NPV.1")!;
    expect(s.text).toBe("count from 0 in multiples of 4, 8, 50 and 100; find 10 or 100 more or less than a given number");
    expect(s).toMatchObject({ level: "statement", key_stage_id: "ks2", year_group_id: "y3", strand: "Number – number and place value", statutory: 1, framework: NC_FRAMEWORK });
    expect(JSON.parse(s.year_groups_json!)).toEqual(["y3"]);
    expect(s.parent_id).toBe("ncg:MA.Y3.NPV");
    expect(byRef.get("MA.Y3.NPV")!.level).toBe("strand");
    expect(byRef.get("MA.Y1.NPV.3")!.text).toBe("given a number, identify 1 more and 1 less");
    expect(byRef.get("MA.Y1.NPV.1")!.year_group_id).toBe("y1");
  });

  it("turns sub-bullets into children", () => {
    const parent = byRef.get("MA.Y3.AS.1")!;
    expect(parent.text).toBe("add and subtract numbers mentally, including:");
    const kids = rows.filter((r) => r.parent_id === parent.id);
    expect(kids.map((k) => [k.ref, k.level, k.text])).toEqual([
      ["MA.Y3.AS.1.1", "sub_statement", "a 3-digit number and 1s"],
      ["MA.Y3.AS.1.2", "sub_statement", "a 3-digit number and 10s"],
      ["MA.Y3.AS.1.3", "sub_statement", "a 3-digit number and 100s"],
    ]);
    expect(byRef.get("MA.Y3.AS.2")!.text).toMatch(/^add and subtract numbers with up to 3 digits/);
  });

  it("stores notes and guidance as non-statutory guidance rows", () => {
    const g = rows.filter((r) => r.level === "guidance");
    expect(g.length).toBe(3);
    expect(g.every((r) => r.statutory === 0)).toBe(true);
    expect(byRef.get("MA.Y3.NPV.G1")!.text).toBe("Pupils now use multiples of 2, 3, 4, 5, 8, 10, 50 and 100.");
    expect(byRef.get("MA.Y3.NPV.G1")!.parent_id).toBe("ncg:MA.Y3.NPV");
    expect(byRef.get("MA.Y1.NPV.G1")!.text).toMatch(/^Pupils practise counting \(1, 2, 3…\)/);
  });

  it("disambiguates clashing strand codes in document order", () => {
    expect(byRef.get("MA.Y3.PS.1")!.strand).toBe("Geometry – properties of shapes");
    expect(byRef.get("MA.Y3.PS2.1")!.strand).toBe("Geometry – planes of symmetry");
  });

  it("handles key stage 3 with nested strands and a transparent 'Subject content' heading", () => {
    const wm = byRef.get("MA.KS3.WM-DF.1")!;
    expect(wm).toMatchObject({ key_stage_id: "ks3", year_group_id: null, strand: "Working mathematically", sub_strand: "Develop fluency" });
    expect(JSON.parse(wm.year_groups_json!)).toEqual(["y7", "y8", "y9"]);
    expect(byRef.get("MA.KS3.N.2")!.text).toMatch(/^use the 4 operations/);
    expect(byRef.get("MA.KS3.WM-DF")!.parent_id).toBe("ncg:MA.KS3.WM");
  });

  it("English: year bands, spoken language split per key stage, nested comprehension bullets", () => {
    const en = parseProgrammeOfStudy(htmlToBlocks(readFix("nc/english_body.html")), { id: "english", code: "EN" });
    const r = new Map(en.map((x) => [x.ref, x]));
    expect(r.get("EN.Y1-2.SL.1")).toMatchObject({ key_stage_id: "ks1", strand: "Spoken language", text: "listen and respond appropriately to adults and their peers" });
    expect(JSON.parse(r.get("EN.Y3-6.SL.2")!.year_groups_json!)).toEqual(["y3", "y4", "y5", "y6"]);
    expect(r.get("EN.Y1.WR.2")!.strand).toBe("Reading – word reading");
    const c1 = r.get("EN.Y3-4.C.1")!;
    expect(c1).toMatchObject({ key_stage_id: "ks2", year_group_id: null, strand: "Reading – comprehension" });
    expect(JSON.parse(c1.year_groups_json!)).toEqual(["y3", "y4"]);
    expect(en.filter((x) => x.parent_id === c1.id)).toHaveLength(2);
    expect(r.get("EN.Y3-4.C.2.1")!.level).toBe("sub_statement");
    expect(r.get("EN.Y3-4.C.3")!.text).toBe("retrieve and record information from non-fiction");
    expect(r.get("EN.Y1.WR.G1")!.statutory).toBe(0);
  });

  it("History: key-stage lists, inline 'Examples (non-statutory)' become guidance", () => {
    const hi = parseProgrammeOfStudy(htmlToBlocks(readFix("nc/history_body.html")), { id: "history", code: "HI" });
    const r = new Map(hi.map((x) => [x.ref, x]));
    expect(r.get("HI.KS1.1")!.text).toBe("changes within living memory – where appropriate, these should be used to reveal aspects of change in national life");
    expect(r.get("HI.KS1.1")!.parent_id).toBeNull();
    expect(r.get("HI.KS2.1")!.text).toBe("changes in Britain from the Stone Age to the Iron Age");
    expect(r.get("HI.KS2.2")!.text).toBe("the Roman Empire and its impact on Britain");
    const g = hi.filter((x) => x.level === "guidance").map((x) => x.text);
    expect(g).toEqual(["This could include:", "late Neolithic hunter-gatherers and early farmers, for example, Skara Brae", "Bronze Age religion, technology and travel, for example, Stonehenge"]);
    expect(hi.some((x) => /awareness of the past/.test(x.text))).toBe(false);
  });
});

describe("ingestNcGovuk", () => {
  let store: SqliteStore;
  beforeEach(async () => {
    store = await newStore();
  });
  afterEach(async () => store.close());

  const ontology = (id: string, subject: string, ks: string | null, level: string, text: string) => ({
    id, subject_id: subject, key_stage_id: ks, level, text, framework: "nc2014", statutory: 1, source_id: "oak_ontology",
    notes: level === "statement" ? "Sourced via Oak Curriculum Ontology v0.1.x; to be cross-checked against gov.uk programmes of study when reachable." : null,
  });

  it("ingests HTML + missing-key-stage PDF, cross-checks the ontology, and is idempotent", async () => {
    await store.insert("curriculum_statements", [
      ontology("nc:a", "mathematics", "ks2", "statement", "Count from 0 in multiples of 4, 8, 50 and 100; find 10 or 100 more or less than a given number."),
      ontology("nc:b", "mathematics", "ks2", "statement", "Recite the 13 times table backwards."),
      ontology("nc:c", "history", "ks2", "statement", "Changes in Britain from the Stone Age to the Iron Age."),
      ontology("nc:d", "mathematics", "ks4", "sub_statement", "Factorising quadratic expressions of the form x2 + bx + c."),
      ontology("nc:e", "mathematics", null, "aim", "Become fluent in the fundamentals of mathematics, including through varied and frequent practice with increasingly complex problems over time."),
      ontology("nc:f", "music", "ks2", "statement", "Play and perform in solo and ensemble contexts."),
      ontology("nc:g", "history", "ks2", "statement", "Bronze Age religion, technology and travel, for example, Stonehenge."),
    ]);
    const { fetcher, requested } = makeFetcher(routes());
    const stats = await ingestNcGovuk(store, { fetcher });
    expect(stats.curriculum_statements).toBeGreaterThan(40);
    // KS1-2 PDF is covered by the HTML and never downloaded; KS4 PDF is parsed
    expect(requested.some((u) => /PRIMARY_national_curriculum/.test(u))).toBe(false);
    expect(requested.some((u) => /KS4_maths/.test(u))).toBe(true);
    const ks4 = store.raw<{ ref: string; text: string; level: string; parent_id: string }>(
      "SELECT ref, text, level, parent_id FROM curriculum_statements WHERE framework = ? AND key_stage_id = 'ks4' AND level != 'strand' ORDER BY sort",
      NC_FRAMEWORK,
    );
    expect(ks4.map((r) => r.ref)).toEqual(["MA.KS4.N.1", "MA.KS4.N.2", "MA.KS4.N.3", "MA.KS4.A.1", "MA.KS4.A.1.1", "MA.KS4.A.1.2", "MA.KS4.A.2"]);
    expect(ks4[4]).toMatchObject({ level: "sub_statement", parent_id: "ncg:MA.KS4.A.1" });

    const row = await store.first<Record<string, unknown>>("curriculum_statements", { where: { id: "ncg:MA.Y3.NPV.1" } });
    expect(row).toMatchObject({ source_id: "nc_govuk", licence_id: "OGL-3.0", source_url: `${GOV}${HTML("mathematics")}` });
    expect(row!.checksum).toMatch(/^[0-9a-f]{64}$/);

    const notes = (id: string) => store.raw<{ notes: string }>("SELECT notes FROM curriculum_statements WHERE id = ?", id)[0].notes;
    const today = new Date().toISOString().slice(0, 10);
    expect(notes("nc:a")).toBe(`Sourced via Oak Curriculum Ontology v0.1.x | verified against gov.uk ${GOV}${HTML("mathematics")} on ${today} (MA.Y3.NPV.1, similarity 1.00)`);
    expect(notes("nc:b")).toMatch(/^Sourced via Oak Curriculum Ontology v0\.1\.x \| NOT FOUND on gov\.uk — review/);
    expect(notes("nc:c")).toContain("verified against gov.uk");
    expect(notes("nc:d")).toContain("(MA.KS4.A.1.1,");
    expect(notes("nc:e")).toContain("(MA.AIM.1,");
    expect(notes("nc:f")).toMatch(/^Sourced via Oak .*when reachable\.$/); // no gov.uk rows for music: untouched
    expect(notes("nc:g")).toMatch(/found only in non-statutory guidance/);
    expect(await store.count("curriculum_statements", { framework: "nc2014" })).toBe(7);

    // subjects not linked from the collection fall back to known paths; missing ones are logged, not fatal
    expect(logs(store, "nc_govuk", "collection_link_missing").length).toBe(9);
    expect((await lastRun(store, "nc_govuk")).status).toBe("partial");

    // re-run: checkpoints skip parsing, cross-check re-applies without duplicating notes
    const before = await store.count("curriculum_statements", {});
    await ingestNcGovuk(store, { fetcher });
    expect(await store.count("curriculum_statements", {})).toBe(before);
    expect(notes("nc:a").match(/verified against/g)).toHaveLength(1);
    // forced re-run re-parses and upserts the same ids
    await ingestNcGovuk(store, { fetcher, force: true });
    expect(await store.count("curriculum_statements", {})).toBe(before);
    expect(notes("nc:b").match(/NOT FOUND/g)).toHaveLength(1);
  });

  it("stops cleanly with host_blocked when gov.uk is unreachable", async () => {
    const stats = await ingestNcGovuk(store, { fetcher: blockedFetcher });
    expect(stats).toBeDefined();
    const run = await lastRun(store, "nc_govuk");
    expect(run.status).toBe("blocked");
    const l = logs(store, "nc_govuk", "host_blocked");
    expect(l).toHaveLength(1);
    expect(l[0].message).toContain("www.gov.uk");
    expect(await store.count("curriculum_statements", { framework: NC_FRAMEWORK })).toBe(0);
  });
});
