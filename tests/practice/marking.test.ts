import { describe, expect, it } from "vitest";
import { describeResponse, formatNumber, markQuestion, normaliseText, parseNumber, shuffledIndices } from "@/practice/marking";
import type { Question } from "@/practice/types";

const base = { id: "q", prompt: "p", difficulty: 1, marks: 1, explanation: "e" };

describe("normaliseText", () => {
  it("ignores case, extra spaces, a final full stop and curly quotes", () => {
    expect(normaliseText("  The  Cat. ")).toBe("the cat");
    expect(normaliseText("don’t")).toBe("don't");
    expect(normaliseText("“hello”")).toBe('"hello"');
    expect(normaliseText("end...")).toBe("end");
  });
  it("keeps other punctuation", () => {
    expect(normaliseText("Yes!")).toBe("yes!");
  });
});

describe("parseNumber", () => {
  it("reads common ways of writing numbers", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber(" 3.5 ")).toBe(3.5);
    expect(parseNumber("1,250")).toBe(1250);
    expect(parseNumber("12,345,678")).toBe(12345678);
    expect(parseNumber("−7")).toBe(-7);
    expect(parseNumber("-0.25")).toBe(-0.25);
    expect(parseNumber("£4.50")).toBe(4.5);
    expect(parseNumber("12 cm", "cm")).toBe(12);
    expect(parseNumber("12cm", "cm")).toBe(12);
    expect(parseNumber("1/2")).toBe(0.5);
    expect(parseNumber("2 1/2")).toBe(2.5);
    expect(parseNumber(".5")).toBe(0.5);
  });
  it("rejects non-numbers", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1,25")).toBeNull();
    expect(parseNumber("3/0")).toBeNull();
  });
});

describe("markQuestion", () => {
  it("mcq", () => {
    const q: Question = { ...base, type: "mcq", options: ["a", "b", "c"], answer: 1 };
    expect(markQuestion(q, { type: "mcq", choice: 1 }).correct).toBe(true);
    expect(markQuestion(q, { type: "mcq", choice: 0 }).correct).toBe(false);
    expect(markQuestion(q, { type: "mcq", choice: null }).correct).toBe(false);
  });

  it("multi needs exactly the right set, in any order", () => {
    const q: Question = { ...base, type: "multi", options: ["a", "b", "c", "d"], answer: [0, 2] };
    expect(markQuestion(q, { type: "multi", choices: [2, 0] }).correct).toBe(true);
    expect(markQuestion(q, { type: "multi", choices: [0] }).correct).toBe(false);
    expect(markQuestion(q, { type: "multi", choices: [0, 2, 3] }).correct).toBe(false);
  });

  it("numeric with tolerance, units and accept list", () => {
    const q: Question = { ...base, type: "numeric", answer: 3.14, tolerance: 0.01, unit: "cm", accept: ["pi"] };
    expect(markQuestion(q, { type: "numeric", value: "3.14" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "3.15" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "3.16" }).correct).toBe(false);
    expect(markQuestion(q, { type: "numeric", value: "3.14 cm" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "PI" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "three" }).correct).toBe(false);
  });

  it("numeric with zero tolerance is exact, and fractions can be accepted", () => {
    const q: Question = { ...base, type: "numeric", answer: 0.5, accept: ["1/2"] };
    expect(markQuestion(q, { type: "numeric", value: "0.5" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "1 / 2" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "0.50" }).correct).toBe(true);
    expect(markQuestion(q, { type: "numeric", value: "0.51" }).correct).toBe(false);
    const big: Question = { ...base, type: "numeric", answer: 45000 };
    expect(markQuestion(big, { type: "numeric", value: "45,000" }).correct).toBe(true);
  });

  it("text normalises case, spaces, final full stop and curly quotes", () => {
    const q: Question = { ...base, type: "text", answer: "Don't", accept: ["do not"] };
    expect(markQuestion(q, { type: "text", value: "don’t." }).correct).toBe(true);
    expect(markQuestion(q, { type: "text", value: "  DO   NOT " }).correct).toBe(true);
    expect(markQuestion(q, { type: "text", value: "dont" }).correct).toBe(false);
  });

  it("order must be exact", () => {
    const q: Question = { ...base, type: "order", items: ["a", "b", "c"] };
    expect(markQuestion(q, { type: "order", order: [0, 1, 2] }).correct).toBe(true);
    expect(markQuestion(q, { type: "order", order: [1, 0, 2] }).correct).toBe(false);
  });

  it("match must be exact", () => {
    const q: Question = { ...base, type: "match", pairs: [["a", "1"], ["b", "2"], ["c", "3"]] };
    expect(markQuestion(q, { type: "match", picks: [0, 1, 2] }).correct).toBe(true);
    expect(markQuestion(q, { type: "match", picks: [0, 2, 1] }).correct).toBe(false);
    expect(markQuestion(q, { type: "match", picks: [0, 1, null] }).correct).toBe(false);
  });

  it("truefalse must be exact", () => {
    const q: Question = { ...base, type: "truefalse", statements: [{ s: "x", a: true }, { s: "y", a: false }] };
    expect(markQuestion(q, { type: "truefalse", values: [true, false] }).correct).toBe(true);
    expect(markQuestion(q, { type: "truefalse", values: [true, true] }).correct).toBe(false);
    expect(markQuestion(q, { type: "truefalse", values: [true, null] }).correct).toBe(false);
  });

  it("cloze needs every gap, with per-gap alternatives", () => {
    const q: Question = { ...base, type: "cloze", prompt: "___ and ___", answer: ["45", "5"], accept: [["forty-five"], ["five"]] };
    expect(markQuestion(q, { type: "cloze", values: ["45", "5"] }).correct).toBe(true);
    expect(markQuestion(q, { type: "cloze", values: ["Forty-five", " five. "] }).correct).toBe(true);
    expect(markQuestion(q, { type: "cloze", values: ["45", "6"] }).correct).toBe(false);
    expect(markQuestion(q, { type: "cloze", values: ["5", "45"] }).correct).toBe(false);
  });

  it("extended scores the ticked checklist points", () => {
    const q: Question = { ...base, type: "extended", marks: 4, model: "m", checklist: ["a", "b", "c", "d"] };
    expect(markQuestion(q, { type: "extended", written: "", ticked: [0, 1, 2, 3] })).toEqual({ correct: true, marksAwarded: 4, marksAvailable: 4 });
    expect(markQuestion(q, { type: "extended", written: "", ticked: [0, 1] }).marksAwarded).toBe(2);
    expect(markQuestion(q, { type: "extended", written: "", ticked: [0] }).correct).toBe(false);
    expect(markQuestion(q, { type: "extended", written: "", ticked: [] }).marksAwarded).toBe(0);
    expect(markQuestion(q, { type: "extended", written: "", ticked: [0, 0, 9] }).marksAwarded).toBe(1);
  });

  it("multi-mark questions award all marks or none", () => {
    const q: Question = { ...base, marks: 2, type: "order", items: ["a", "b"] };
    expect(markQuestion(q, { type: "order", order: [0, 1] }).marksAwarded).toBe(2);
    expect(markQuestion(q, { type: "order", order: [1, 0] }).marksAwarded).toBe(0);
  });

  it("a response of the wrong type is wrong", () => {
    const q: Question = { ...base, type: "mcq", options: ["a", "b", "c"], answer: 1 };
    expect(markQuestion(q, { type: "text", value: "b" }).correct).toBe(false);
  });
});

describe("helpers", () => {
  it("shuffledIndices is deterministic and never the original order", () => {
    for (let n = 2; n < 7; n++) {
      for (const seed of ["a", "b", "c", "dd", "zz"]) {
        const s = shuffledIndices(n, seed);
        expect([...s].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(s.every((v, i) => v === i)).toBe(false);
        expect(shuffledIndices(n, seed)).toEqual(s);
      }
    }
  });
  it("formatNumber", () => {
    expect(formatNumber(45000)).toBe("45,000");
    expect(formatNumber(1250)).toBe("1250");
    expect(formatNumber(-3.5)).toBe("-3.5");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
  it("describeResponse", () => {
    const q: Question = { ...base, type: "mcq", options: ["a", "b", "c"], answer: 1 };
    expect(describeResponse(q, { type: "mcq", choice: 2 })).toBe("c");
    expect(describeResponse(q, null)).toBe("No answer");
  });
});
