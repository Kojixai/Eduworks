import { describe, expect, it } from "vitest";
import { computeLine, computeQuestion, parseAnswerValue, parseRequirement } from "../ingest/sources/sta_papers_arith";
import { classifyAttachment, paperSpec, publicationInfo } from "../ingest/sources/sta_papers_discovery";
import { parseMathsDomain, substrandsFor } from "../ingest/sources/sta_papers_links";
import { coverFacts, parseCopyright, thirdPartyFor, type LinesDoc } from "../ingest/sources/sta_papers_pdf";
import { answerKind, detectMcq } from "../ingest/sources/sta_papers";

const lines = (texts: string[]): LinesDoc => ({
  page_count: 1,
  pages: [
    {
      page: 1,
      width: 595,
      height: 842,
      lines: texts.map((text, i) => ({ x0: 40, y0: 80 + i * 20, x1: 500, y1: 92 + i * 20, text, size: 10, bold: false, words: [] })),
    },
  ],
});

describe("attachment classification", () => {
  const c = (t: string, pub = "") => {
    const r = classifyAttachment(t, pub);
    return `${r.kind}:${r.subject}:${r.paperNumber}`;
  };
  it("classifies KS2 titles", () => {
    expect(c("2019 key stage 2 mathematics Paper 1: arithmetic")).toBe("maths_arithmetic:maths:1");
    expect(c("2019 key stage 2 mathematics Paper 3: reasoning")).toBe("maths_reasoning:maths:3");
    expect(c("2019 key stage 2 mathematics: mark schemes")).toBe("mark_scheme:maths:null");
    expect(c("2019 key stage 2 English grammar, punctuation and spelling Paper 1: questions")).toBe("gps_questions:gps:1");
    expect(c("2019 key stage 2 English grammar, punctuation and spelling Paper 2: spelling")).toBe("gps_spelling:gps:2");
    expect(c("2019 key stage 2 English grammar, punctuation and spelling Paper 2: spelling task administration instructions and script")).toBe(
      "spelling_script:gps:2",
    );
    expect(c("2019 key stage 2 English reading: reading booklet")).toBe("reading_booklet:reading:null");
    expect(c("2019 key stage 2 English reading: answer booklet")).toBe("reading_answer:reading:null");
    expect(c("2019 key stage 2 English reading: mark schemes")).toBe("mark_scheme:reading:null");
    expect(c("2019 national curriculum tests: copyright report")).toBe("copyright_report:null:null");
    expect(c("2019 key stage 2 mathematics Paper 2: reasoning – modified large print")).toMatch(/^ignore/);
    expect(c("Key stage 2 tests: 2019 test administration guidance")).toMatch(/^ignore/);
    expect(c("Paper 1: arithmetic", "Key stage 2 tests: 2019 mathematics test materials")).toBe("maths_arithmetic:maths:1");
  });
  it("classifies KS1 titles", () => {
    expect(c("2019 key stage 1 English reading Paper 1: reading and answer booklet")).toBe("reading_answer:reading:1");
    expect(c("2019 key stage 1 English reading Paper 2: reading answer booklet")).toBe("reading_answer:reading:2");
    expect(c("2019 key stage 1 English grammar, punctuation and spelling Paper 1: spelling")).toBe("gps_spelling:gps:1");
    expect(c("2019 key stage 1 English grammar, punctuation and spelling Paper 2: questions")).toBe("gps_questions:gps:2");
  });
  it("identifies per-year publications", () => {
    expect(publicationInfo("Key stage 2 tests: 2019 mathematics test materials", "/government/publications/key-stage-2-tests-2019-mathematics-test-materials")).toEqual({ ks: "ks2", year: 2019 });
    expect(publicationInfo("Multiplication tables check", "/x")).toBeNull();
  });
  it("knows STA paper totals and timings", () => {
    expect(paperSpec("ks2", "maths_arithmetic", 1)).toMatchObject({ totalMarks: 40, timeMinutes: 30, slug: "maths-p1-arithmetic" });
    expect(paperSpec("ks2", "maths_reasoning", 3)).toMatchObject({ totalMarks: 35, timeMinutes: 40, slug: "maths-p3-reasoning" });
    expect(paperSpec("ks2", "gps_questions", 1)).toMatchObject({ totalMarks: 50, timeMinutes: 45 });
    expect(paperSpec("ks2", "reading_answer", null)).toMatchObject({ totalMarks: 50, timeMinutes: 60, slug: "reading" });
    expect(paperSpec("ks1", "maths_arithmetic", 1)).toMatchObject({ totalMarks: 25 });
    expect(paperSpec("ks1", "reading_answer", null, true).slug).toBe("reading-p1");
  });
});

describe("arithmetic evaluation", () => {
  const v = (s: string) => computeQuestion(s)?.value.toString() ?? null;
  it("computes printed expressions exactly", () => {
    expect(v("345 + 211 =")).toBe("556");
    expect(v("3 × 4 = ")).toBe("12");
    expect(v("¾ of 12")).toBe("9");
    expect(v("1 ÷ 4 =")).toBe("1/4");
    expect(v("0.5 × 12 =")).toBe("6");
    expect(v("25% of 80 =")).toBe("20");
    expect(v("12 ÷ 3/4 =")).toBe("16");
    expect(v("1 3/4 + 1/2 =")).toBe("9/4");
    expect(v("5² =")).toBe("25");
    expect(v("2 7 4 3\n× 2 6")).toBe("71318");
    expect(v("Here is a shape.")).toBeNull();
  });
  it("solves missing-number boxes", () => {
    expect(computeLine("__ + 5 = 12")?.value.toString()).toBe("7");
    expect(computeLine("100 − □ = 37")?.value.toString()).toBe("63");
    expect(computeLine("60 ÷ □ = 5")?.value.toString()).toBe("12");
    expect(computeLine("□ = 3 × 7")?.value.toString()).toBe("21");
  });
  it("parses mark scheme answers", () => {
    expect(parseAnswerValue("1,000")?.value.toString()).toBe("1000");
    expect(parseAnswerValue("2 1/4")?.form).toBe("mixed");
    expect(parseAnswerValue("35 r 2")?.remainder).toEqual({ q: 35n, r: 2n });
    expect(parseAnswerValue("because")).toBeNull();
  });
  it("reads requirement alternatives and equivalence wording, ignoring 'Do not accept' values", () => {
    const r = parseRequirement("6/5", "Accept equivalent fractions or the exact decimal equivalent, e.g. 1 1/5, 1.2 Do not accept 1.20");
    expect(r.primary?.text).toBe("6/5");
    expect(r.alternatives.map((a) => a.text)).toEqual(["1 1/5", "1.2"]);
    expect([r.equivalentFractions, r.exactDecimal]).toEqual([true, true]);
    expect(parseRequirement("Award 1 mark for a correct explanation", "").primary).toBeNull();
    expect(parseRequirement("0.25 OR 1/4", "").alternatives.map((a) => a.text)).toEqual(["1/4"]);
  });
  it("chooses accepted_answers kinds from the mark scheme's equivalence rules", () => {
    const f = parseAnswerValue("3/4")!;
    expect(answerKind(f, true, true)).toBe("fraction");
    expect(answerKind(f, true, false)).toBe("numeric");
    expect(answerKind(f, false, false)).toBe("exact");
    expect(answerKind(parseAnswerValue("0.75")!, false, false)).toBe("numeric");
  });
});

describe("GPS tick-one items", () => {
  const q = "Which word is a preposition?\nTick one.\nquickly\nunder\nhappy\nsing";
  it("accepts an unambiguous correct option", () => {
    expect(detectMcq(q, 'Award 1 mark for "under"')).toEqual({ options: ["quickly", "under", "happy", "sing"], correct: 1 });
  });
  it("falls back when the mark scheme is ambiguous", () => {
    expect(detectMcq(q, "Award 1 mark for the correct box ticked.")).toBeNull();
    expect(detectMcq("Tick one.\nthe\nthen\nthere", 'Award 1 mark for "then"')).toEqual({ options: ["the", "then", "there"], correct: 1 });
    expect(detectMcq("Tick one.\nthe\nthen", "Award 1 mark for then")).toBeNull();
  });
});

describe("copyright reports", () => {
  const items = parseCopyright(
    lines([
      "2019 key stage 2 copyright report",
      "Mathematics Paper 3: reasoning",
      "Questions 4 and 9–10: photographs © Getty Images",
      "Page 12: illustration © Jane Doe",
      "English grammar, punctuation and spelling Paper 1: questions",
      "Question 22: extract from 'A Poem' © A. Poet",
      "English reading: reading booklet",
      "'Space Race' © B. Author, reproduced by permission",
    ]),
  );
  it("attaches question and page references to the right paper", () => {
    const tp = thirdPartyFor(items, "maths", 3);
    expect([...tp.questions].sort()).toEqual(["10", "4", "9"]);
    expect([...tp.pages]).toEqual([12]);
    expect(tp.whole).toBe(false);
    expect(thirdPartyFor(items, "maths", 2).questions.size).toBe(0);
    expect([...thirdPartyFor(items, "gps", 1).questions]).toEqual(["22"]);
  });
  it("always treats reading papers as wholly third-party", () => {
    expect(thirdPartyFor(items, "reading", null, true).whole).toBe(true);
    expect(thirdPartyFor([], "reading", null, true).whole).toBe(true);
  });
});

describe("content domains and cover facts", () => {
  it("parses maths content domain references", () => {
    expect(parseMathsDomain("5F10")).toMatchObject({ year: 5, strand: "F", element: 10, sub: null });
    expect(parseMathsDomain("3N2b")).toMatchObject({ year: 3, strand: "N", element: 2, sub: "b" });
    expect(parseMathsDomain("G5.1")).toBeNull();
    expect(substrandsFor(parseMathsDomain("6C9")!, "1 ÷ 4 =")).toEqual(["Multiplication and division", "Addition, subtraction, multiplication and division"]);
  });
  it("reads totals and timings from the cover when printed", () => {
    expect(coverFacts("You have 30 minutes to complete this test. There is a total of 40 marks.")).toEqual({ totalMarks: 40, timeMinutes: 30 });
    expect(coverFacts("Key stage 2 Mathematics")).toEqual({ totalMarks: null, timeMinutes: null });
  });
});
