import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SqliteStore } from "../src/lib/db/sqlite";
import { pdfPhonicsPages, pdfText } from "../ingest/sources/govuk_common";
import {
  classifyAttachment,
  expectedYears,
  ingestStaPhonics,
  mergeWordLists,
  parseGeneralRules,
  parseThresholds,
  wordsFromPupilPages,
  wordsFromScoringText,
} from "../ingest/sources/sta_phonics";
import {
  GOV,
  api,
  blockedFetcher,
  checkpointGuard,
  collection,
  lastRun,
  logs,
  makeFetcher,
  newStore,
  pdf,
  pdfAtt,
  publication,
} from "./fixtures/govuk/helpers";

const guard = checkpointGuard(["sta_phonics"]);
beforeAll(() => guard.save());
afterAll(() => guard.restore());
beforeEach(() => guard.clear());
afterEach(() => guard.clear());

const S1_PSEUDO = ["vop", "jub", "zint", "thap", "quem", "yeb", "shug", "chon", "fape", "wix"];
const S2_REAL = ["frost", "crisp", "stamp", "train", "spring", "slide", "phone", "cloud", "shirt", "plant"];

describe("phonics extraction", () => {
  it("expected years skip 2020 and include autumn 2021", () => {
    const ys = expectedYears(new Date("2023-09-01"));
    expect(ys[0]).toBe(2012);
    expect(ys).not.toContain(2020);
    expect(ys).toContain(2021);
    expect(ys[ys.length - 1]).toBe(2023);
    expect(expectedYears(new Date("2024-03-01")).at(-1)).toBe(2023);
  });

  it("classifies attachments", () => {
    expect(classifyAttachment("2019 phonics screening check: pupils' materials")).toBe("pupils");
    expect(classifyAttachment("2019 phonics screening check: practice sheet")).toBe("practice");
    expect(classifyAttachment("2019 phonics screening check: scoring guidance")).toBe("scoring");
    expect(classifyAttachment("Phonics screening check: answer sheet")).toBe("scoring");
    expect(classifyAttachment("2019 phonics screening check: administration guidance")).toBe("administration");
    expect(classifyAttachment("Phonics screening check 2019: braille version")).toBe("other");
  });

  it("scoring guidance (list layout) gives 40 words with explicit pseudo flags", () => {
    const ws = wordsFromScoringText(pdfText(pdf("phonics_2019_scoring.pdf").file).join("\n"));
    expect(ws).toHaveLength(40);
    expect(ws.slice(0, 10).map((w) => w.word)).toEqual(S1_PSEUDO);
    expect(ws.every((w) => w.explicit)).toBe(true);
    expect(ws.filter((w) => w.pseudo).map((w) => w.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(ws[20]).toMatchObject({ section: 2, position: 21, word: "blorn" });
    expect(ws.some((w) => w.word === "at")).toBe(false); // practice words excluded
  });

  it("scoring guidance (table layout: number / word / type on separate lines)", () => {
    const ws = wordsFromScoringText(pdfText(pdf("phonics_2022_scoring.pdf").file).join("\n"));
    expect(ws).toHaveLength(40);
    expect(ws.map((w) => w.position)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(ws.slice(30).map((w) => w.word)).toEqual(S2_REAL);
    expect(ws.slice(30).every((w) => w.pseudo === false && w.explicit)).toBe(true);
    expect(ws.slice(20, 30).every((w) => w.pseudo === true)).toBe(true);
  });

  it("pupils' materials: words in order, alien image marks pseudo-words, practice page skipped", () => {
    const ws = wordsFromPupilPages(pdfPhonicsPages(pdf("phonics_2019_pupils.pdf").file));
    expect(ws).toHaveLength(40);
    expect(ws.map((w) => w.pseudo)).toEqual([...Array(10).fill(true), ...Array(10).fill(false), ...Array(10).fill(true), ...Array(10).fill(false)]);
    expect(ws[0].section).toBe(1);
    expect(ws[39]).toMatchObject({ section: 2, word: "plant", explicit: false });
  });

  it("merging: scoring + pupils agree -> auto_ok; pupils only -> needs_review; disagreement flagged", () => {
    const sc = wordsFromScoringText(pdfText(pdf("phonics_2019_scoring.pdf").file).join("\n"));
    const pu = wordsFromPupilPages(pdfPhonicsPages(pdf("phonics_2019_pupils.pdf").file));
    const ok = mergeWordLists(sc, pu);
    expect(ok.issues).toEqual([]);
    expect(ok.words.every((w) => w.review_status === "auto_ok")).toBe(true);
    const only = mergeWordLists([], pu);
    expect(only.words.every((w) => w.review_status === "needs_review")).toBe(true);
    expect(only.words[0]).toMatchObject({ position: 1, section: 1, is_pseudo: 1 });
    const bad = pu.map((w, i) => (i === 3 ? { ...w, pseudo: false } : i === 5 ? { ...w, word: "yab" } : w));
    const m = mergeWordLists(sc, bad);
    expect(m.words[3]).toMatchObject({ is_pseudo: 1, review_status: "needs_review" });
    expect(m.words[5]).toMatchObject({ word: "yeb", review_status: "needs_review" });
    expect(m.words[0].review_status).toBe("auto_ok");
    expect(m.issues).toHaveLength(2);
  });

  it("thresholds and general rules from page text", () => {
    expect([...parseThresholds("The threshold mark for the 2019 phonics screening check is 32. Results were published on 26 June 2019.", null)]).toEqual([[2019, 32]]);
    expect([...parseThresholds("The threshold mark is 32.", 2016)]).toEqual([[2016, 32]]);
    expect([...parseThresholds("Year | Threshold mark\n2012 | 32\n2013 | 32", null, { tables: true })]).toEqual([[2012, 32], [2013, 32]]);
    expect([...parseThresholds("Check window 2019 | 10 June", null, { tables: true })]).toEqual([]);
    expect([...parseThresholds("Headteachers must return the declaration by 24 June 2019.", 2019)]).toEqual([]);
    const rules = parseGeneralRules(
      "The check comprises 40 words divided into two sections. It contains 20 pseudo-words, which are presented with a picture of an alien. Pupils who do not meet the expected standard in year 1 should take the check again at the end of year 2.",
    );
    expect(Object.fromEntries(rules.map((r) => [r.rule_key, r.value]))).toEqual({
      words_per_check: "40", sections: "2", pseudo_words_per_check: "20", pseudo_word_alien: "true", year2_recheck: "true",
    });
  });
});

describe("ingestStaPhonics", () => {
  let store: SqliteStore;
  beforeEach(async () => {
    store = await newStore();
  });
  afterEach(async () => store.close());

  const P = (y: number) => `/government/publications/phonics-screening-check-${y}-materials`;
  const TH = "/government/publications/phonics-screening-check-threshold-mark";
  const COLL = "/government/collections/phonics";
  function routes() {
    const a19 = [
      pdfAtt("2019 phonics screening check: pupils' materials", "2019_phonics_pupils_materials.pdf"),
      pdfAtt("2019 phonics screening check: scoring guidance", "2019_phonics_scoring_guidance.pdf"),
      pdfAtt("2019 phonics screening check: practice sheet", "2019_phonics_practice_sheet.pdf"),
    ];
    const a18 = [pdfAtt("2018 phonics screening check: pupils' materials", "2018_phonics_pupils_materials.pdf")];
    const a22 = [pdfAtt("2022 phonics screening check: answer sheet", "2022_phonics_answer_sheet.pdf")];
    return {
      [api(COLL)]: collection(COLL, "Phonics screening check", [
        { base_path: P(2018), title: "Phonics screening check: 2018 materials" },
        { base_path: P(2019), title: "Phonics screening check: 2019 materials" },
        { base_path: P(2022), title: "Phonics screening check: 2022 materials" },
        { base_path: TH, title: "Phonics screening check: threshold mark" },
        { base_path: "/government/publications/key-stage-1-tests", title: "Key stage 1 tests: 2019 materials" },
      ]),
      [api(P(2018))]: publication(P(2018), "Phonics screening check: 2018 materials", a18),
      [a18[0].url]: pdf("phonics_2018_pupils.pdf"),
      [api(P(2019))]: publication(P(2019), "Phonics screening check: 2019 materials", a19),
      [a19[0].url]: pdf("phonics_2019_pupils.pdf"),
      [a19[1].url]: pdf("phonics_2019_scoring.pdf"),
      [a19[2].url]: pdf("phonics_2019_practice.pdf"),
      [api(P(2022))]: publication(P(2022), "Phonics screening check: 2022 materials", a22, "<p>The 2022 threshold mark is 32.</p>"),
      [a22[0].url]: pdf("phonics_2022_scoring.pdf"),
      [api(TH)]: publication(
        TH,
        "Phonics screening check: threshold mark",
        [],
        `<p>The threshold mark for each year of the phonics screening check:</p>
         <table><thead><tr><th>Year</th><th>Threshold mark</th></tr></thead><tbody><tr><td>2018</td><td>32</td></tr><tr><td>2019</td><td>32</td></tr></tbody></table>
         <p>Pupils who do not meet the expected standard in year 1 will take the check again at the end of year 2.</p>`,
      ),
    } as Record<string, never>;
  }

  it("stores words, practice words, thresholds and rules; resumable and idempotent", async () => {
    const { fetcher } = makeFetcher(routes());
    await ingestStaPhonics(store, { fetcher, now: new Date("2022-09-01") });
    const words = (y: number, kind = "official") =>
      store.raw<{ id: string; word: string; is_pseudo: number; section: number; position: number; review_status: string; set_name: string; source_url: string }>(
        "SELECT * FROM phonics_words WHERE check_year = ? AND kind = ? ORDER BY position", y, kind,
      );
    const w19 = words(2019);
    expect(w19).toHaveLength(40);
    expect(w19[0]).toMatchObject({ id: "phonics:2019:official:1", word: "vop", is_pseudo: 1, section: 1, review_status: "auto_ok", set_name: "2019 check" });
    expect(w19[0].source_url).toMatch(/scoring_guidance/);
    expect(w19[39]).toMatchObject({ word: "plant", is_pseudo: 0, section: 2, position: 40 });
    expect(w19.filter((w) => w.is_pseudo)).toHaveLength(20);

    const w18 = words(2018);
    expect(w18).toHaveLength(40);
    expect(w18.every((w) => w.review_status === "needs_review")).toBe(true); // alien images only
    expect(w18.filter((w) => w.is_pseudo)).toHaveLength(20);

    const w22 = words(2022);
    expect(w22.every((w) => w.review_status === "auto_ok")).toBe(true);

    const pr = words(2019, "official_practice");
    expect(pr.map((w) => [w.word, w.is_pseudo])).toEqual([["at", 0], ["zop", 1], ["in", 0], ["gan", 1]]);
    expect(pr[0].set_name).toBe("2019 practice sheet");

    const rules = Object.fromEntries(
      store.raw<{ rule_key: string; value: string; verification_status: string; source_url: string; assessment: string; id: string }>("SELECT * FROM assessment_rules").map((r) => [r.rule_key, r]),
    );
    expect(rules.threshold_2019).toMatchObject({ id: "phonics_check:threshold_2019", assessment: "phonics_check", value: "32", verification_status: "verified", source_url: `${GOV}${TH}` });
    expect(rules.threshold_2018.value).toBe("32");
    expect(rules.threshold_2022).toMatchObject({ value: "32", source_url: `${GOV}${P(2022)}` });
    expect(rules.words_per_check).toMatchObject({ id: "phonics_check:words_per_check", value: "40", verification_status: "verified" });
    expect(rules.sections.value).toBe("2");
    expect(rules.pseudo_word_alien.value).toBe("true");
    expect(rules.year2_recheck).toMatchObject({ value: "true", source_url: `${GOV}${TH}` });
    // years without materials are logged, not invented
    expect(logs(store, "sta_phonics", "year_missing").length).toBe(7); // 2012-2017, 2021
    expect(rules.threshold_2017).toBeUndefined();
    expect((await lastRun(store, "sta_phonics")).status).toBe("partial");

    const n = await store.count("phonics_words");
    const r = await store.count("assessment_rules");
    await ingestStaPhonics(store, { fetcher, now: new Date("2022-09-01") });
    await ingestStaPhonics(store, { fetcher, now: new Date("2022-09-01"), force: true });
    expect(await store.count("phonics_words")).toBe(n);
    expect(await store.count("assessment_rules")).toBe(r);
  });

  it("stops cleanly with host_blocked", async () => {
    await ingestStaPhonics(store, { fetcher: blockedFetcher, now: new Date("2022-09-01") });
    expect((await lastRun(store, "sta_phonics")).status).toBe("blocked");
    expect(logs(store, "sta_phonics", "host_blocked")[0].message).toContain("www.gov.uk");
    expect(await store.count("phonics_words")).toBe(0);
  });
});
