import { describe, expect, it } from "vitest";
import { markQuestion, parseNumber, normaliseText } from "../src/lib/questions/marking";
import type { QuestionForMarking } from "../src/lib/questions/types";

const base = (over: Partial<QuestionForMarking>): QuestionForMarking => ({ id: "q", qtype: "mcq", marks: 1, options: [], answers: [], ...over });

describe("parseNumber", () => {
  it.each([
    ["1,250", 1250],
    ["£3.50", 3.5],
    ["3.5cm", 3.5],
    ["-4", -4],
    ["−4", -4],
    ["½", 0.5],
    ["1 1/2", 1.5],
    ["3/4", 0.75],
    [" 42 ", 42],
    [".5", 0.5],
  ])("%s -> %s", (s, n) => expect(parseNumber(s)).toBeCloseTo(n as number));
  it("rejects non-numbers and malformed commas", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("12,34")).toBeNull();
    expect(parseNumber("1/0")).toBeNull();
  });
});

describe("mcq", () => {
  const q = base({ qtype: "mcq", options: [{ id: "a", text: "3", is_correct: 0 }, { id: "b", text: "4", is_correct: 1 }] });
  it("awards marks for the correct option", () => expect(markQuestion(q, { optionId: "b" })).toMatchObject({ marksAwarded: 1, correct: true }));
  it("no marks for a wrong option or a wrong response shape", () => {
    expect(markQuestion(q, { optionId: "a" }).marksAwarded).toBe(0);
    expect(markQuestion(q, { value: "4" }).marksAwarded).toBe(0);
    expect(markQuestion(q, null).marksAwarded).toBe(0);
  });
});

describe("multi_select", () => {
  const q = base({ qtype: "multi_select", options: [{ id: "a", text: "2", is_correct: 1 }, { id: "b", text: "3", is_correct: 1 }, { id: "c", text: "4", is_correct: 0 }] });
  it("requires exactly the correct set", () => {
    expect(markQuestion(q, { optionIds: ["b", "a"] }).correct).toBe(true);
    expect(markQuestion(q, { optionIds: ["a"] }).correct).toBe(false);
    expect(markQuestion(q, { optionIds: ["a", "b", "c"] }).correct).toBe(false);
  });
});

describe("numeric", () => {
  const q = base({ qtype: "numeric", marks: 2, answers: [{ answer: "126,698", kind: "numeric" }] });
  it("accepts equivalent typed forms of the same number", () => {
    expect(markQuestion(q, { value: "126698" })).toMatchObject({ marksAwarded: 2, correct: true });
    expect(markQuestion(q, { value: "126,698" }).correct).toBe(true);
  });
  it("rejects wrong or empty answers", () => {
    expect(markQuestion(q, { value: "126,689" }).marksAwarded).toBe(0);
    expect(markQuestion(q, { value: "  " }).marksAwarded).toBe(0);
  });
  it("kind numeric does not accept a fraction for a decimal answer", () => {
    const d = base({ qtype: "numeric", answers: [{ answer: "0.75", kind: "numeric" }] });
    expect(markQuestion(d, { value: "3/4" }).correct).toBe(false);
    expect(markQuestion(d, { value: "0.75" }).correct).toBe(true);
  });
  it("kind fraction accepts any equivalent value", () => {
    const f = base({ qtype: "numeric", answers: [{ answer: "17/12", kind: "fraction" }] });
    expect(markQuestion(f, { value: "17/12" }).correct).toBe(true);
    expect(markQuestion(f, { value: "1 5/12" }).correct).toBe(true);
    expect(markQuestion(f, { value: "34/24" }).correct).toBe(true);
    expect(markQuestion(f, { value: "1.4" }).correct).toBe(false);
  });
  it("respects tolerance", () => {
    const t = base({ qtype: "numeric", answers: [{ answer: "3.14", kind: "numeric", tolerance: 0.01 }] });
    expect(markQuestion(t, { value: "3.141" }).correct).toBe(true);
    expect(markQuestion(t, { value: "3.2" }).correct).toBe(false);
  });
});

describe("text_exact", () => {
  const q = base({ qtype: "text_exact", answers: [{ answer: "photosynthesis" }, { answer: "Photo synthesis" }] });
  it("is case- and whitespace-insensitive and ignores a trailing full stop", () => {
    expect(markQuestion(q, { value: "  Photosynthesis. " }).correct).toBe(true);
    expect(markQuestion(q, { value: "photo   synthesis" }).correct).toBe(true);
    expect(markQuestion(q, { value: "respiration" }).correct).toBe(false);
  });
  it("honours case_sensitive and regex answers", () => {
    const cs = base({ qtype: "text_exact", answers: [{ answer: "London", case_sensitive: 1 }] });
    expect(markQuestion(cs, { value: "london" }).correct).toBe(false);
    const rx = base({ qtype: "text_exact", answers: [{ answer: "^colou?r$", kind: "regex" }] });
    expect(markQuestion(rx, { value: "Color" }).correct).toBe(true);
  });
  it("normaliseText maps curly quotes", () => expect(normaliseText("It’s")).toBe("it's"));
});

describe("ordering", () => {
  const q = base({ qtype: "ordering", options: [{ id: "x", text: "3", correct_position: 2 }, { id: "y", text: "1", correct_position: 1 }, { id: "z", text: "7", correct_position: 3 }] });
  it("needs every item in the right place", () => {
    expect(markQuestion(q, { order: ["y", "x", "z"] }).correct).toBe(true);
    expect(markQuestion(q, { order: ["x", "y", "z"] }).correct).toBe(false);
    expect(markQuestion(q, { order: ["y", "x"] }).correct).toBe(false);
  });
});

describe("matching", () => {
  const q = base({
    qtype: "matching",
    options: [
      { id: "L1", text: "cat", side: "L", match_key: "1" },
      { id: "L2", text: "dog", side: "L", match_key: "2" },
      { id: "R1", text: "meow", side: "R", match_key: "1" },
      { id: "R2", text: "woof", side: "R", match_key: "2" },
    ],
  });
  it("is all-or-nothing with per-pair feedback", () => {
    expect(markQuestion(q, { pairs: { L1: "R1", L2: "R2" } }).correct).toBe(true);
    const r = markQuestion(q, { pairs: { L1: "R2", L2: "R2" } });
    expect(r.correct).toBe(false);
    expect(r.parts).toEqual({ L1: false, L2: true });
  });
});

describe("table_fill", () => {
  const table = { rows: ["a", "b"], cols: ["x"], cells: [{ id: "c1", row: 0, col: 0 }, { id: "c2", row: 1, col: 0 }] };
  it("all cells must be right when no per-cell marks", () => {
    const q = base({ qtype: "table_fill", table, answers: [{ part: "c1", answer: "10", kind: "numeric" }, { part: "c2", answer: "20", kind: "numeric" }] });
    expect(markQuestion(q, { cells: { c1: "10", c2: "20" } }).correct).toBe(true);
    const r = markQuestion(q, { cells: { c1: "10", c2: "21" } });
    expect(r).toMatchObject({ marksAwarded: 0, parts: { c1: true, c2: false } });
  });
  it("awards per-cell marks when the mark scheme gives them", () => {
    const q = base({ qtype: "table_fill", marks: 2, table, answers: [{ part: "c1", answer: "10", kind: "numeric", marks: 1 }, { part: "c2", answer: "20", kind: "numeric", marks: 1 }] });
    expect(markQuestion(q, { cells: { c1: "10", c2: "x" } })).toMatchObject({ marksAwarded: 1, correct: false });
    expect(markQuestion(q, { cells: { c1: "10", c2: "20" } })).toMatchObject({ marksAwarded: 2, correct: true });
  });
});

describe("self_mark", () => {
  const q = base({ qtype: "self_mark", marks: 3 });
  it("uses the ticked marks, clamped to the question's marks", () => {
    expect(markQuestion(q, { awarded: 2 })).toMatchObject({ marksAwarded: 2, correct: false, selfMarked: true });
    expect(markQuestion(q, { awarded: 7 }).marksAwarded).toBe(3);
    expect(markQuestion(q, { awarded: -1 }).marksAwarded).toBe(0);
  });
});
