import { describe, expect, it } from "vitest";
import { generateMtc, validateMtc, markMtc, MTC_DEFAULT_RULES } from "../src/lib/mtc";
import { generateArithmeticPaper, acceptedAnswers } from "../src/lib/arith/generate";
import { Q } from "../src/lib/arith/rational";
import { markQuestion } from "../src/lib/questions/marking";
import { ORIGINAL_PRACTICE_SETS, layoutSet, phonicsOutcome } from "../src/lib/phonics";
import { maskTerm } from "../ingest/sources/original_content";

describe("multiplication tables check generator", () => {
  it("produces rule-compliant checks for many seeds", () => {
    for (let seed = 1; seed <= 300; seed++) expect(validateMtc(generateMtc(seed))).toEqual([]);
  });
  it("is deterministic per seed", () => expect(generateMtc(42)).toEqual(generateMtc(42)));
  it("marks within 6 seconds only", () => {
    const q = { a: 7, b: 8, answer: 56, practice: false };
    expect(markMtc(q, "56", 5900)).toBe(true);
    expect(markMtc(q, "56", MTC_DEFAULT_RULES.secondsPerQuestion * 1000 + 1)).toBe(false);
    expect(markMtc(q, "54", 1000)).toBe(false);
    expect(markMtc(q, "", 1000)).toBe(false);
  });
});

describe("arithmetic paper generator", () => {
  it("KS2 papers have 36 questions worth 40 marks", () => {
    for (const seed of [1, 2, 3, 99]) {
      const p = generateArithmeticPaper("ks2", seed);
      expect(p.items).toHaveLength(36);
      expect(p.totalMarks).toBe(40);
      expect(p.minutes).toBe(30);
    }
  });
  it("KS1 papers have 25 one-mark questions", () => {
    const p = generateArithmeticPaper("ks1", 5);
    expect(p.items).toHaveLength(25);
    expect(p.totalMarks).toBe(25);
  });
  it("every generated answer is marked correct by the marking engine", () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      for (const it of generateArithmeticPaper("ks2", seed).items) {
        const answers = acceptedAnswers(it);
        const q = { id: "x", qtype: "numeric" as const, marks: it.marks, options: [], answers };
        for (const a of answers) expect(markQuestion(q, { value: a.answer }).correct, `${it.prompt} ${a.answer}`).toBe(true);
      }
    }
  });
  it("recomputes simple prompts independently", () => {
    for (const it of generateArithmeticPaper("ks2", 7).items) {
      const m = it.prompt.match(/^([\d,]+) ([+−×÷]) ([\d,]+) =$/);
      if (!m) continue;
      const a = Number(m[1].replace(/,/g, "")), b = Number(m[3].replace(/,/g, ""));
      const v = { "+": a + b, "−": a - b, "×": a * b, "÷": a / b }[m[2] as "+"];
      expect(it.answer.valueOf()).toBeCloseTo(v, 9);
    }
  });
  it("rational helpers", () => {
    expect(new Q(6, 8).toFractionString()).toBe("3/4");
    expect(new Q(17, 12).toMixedString()).toBe("1 5/12");
    expect(Q.of(0.1).add(0.2).toDecimalString()).toBe("0.3");
  });
});

describe("phonics", () => {
  it("each practice set has 40 words, 20 pseudo and 20 real, in two sections", () => {
    for (const s of ORIGINAL_PRACTICE_SETS) {
      const items = layoutSet(s);
      expect(items).toHaveLength(40);
      expect(items.filter((i) => i.isPseudo)).toHaveLength(20);
      expect(items.filter((i) => i.section === 2)).toHaveLength(20);
    }
  });
  it("pseudo-words are not dictionary words and real words are", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dict = new Set<string>(require("an-array-of-english-words"));
    for (const s of ORIGINAL_PRACTICE_SETS)
      for (const it of layoutSet(s)) expect(dict.has(it.word), it.word).toBe(!it.isPseudo);
  });
  it("threshold outcome", () => {
    expect(phonicsOutcome(32)).toMatchObject({ metStandard: true, wordsToThreshold: 0 });
    expect(phonicsOutcome(29)).toMatchObject({ metStandard: false, wordsToThreshold: 3 });
  });
});

describe("derived keyword questions", () => {
  it("masks the term inside its definition", () => {
    expect(maskTerm("A tenth is one of ten equal parts.", "tenth")).toBe("A ____ is one of ten equal parts.");
    expect(maskTerm("Tenths are equal parts.", "tenth")).toBe("____ are equal parts.");
  });
  it("refuses definitions that still leak the term", () => {
    expect(maskTerm("photosynthetic organisms make food", "photosynthesis")).toBeNull();
  });
});
