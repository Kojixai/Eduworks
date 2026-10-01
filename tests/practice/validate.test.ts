import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateBook } from "@/practice/validate";
import { DIAGRAM_KINDS, QUESTION_TYPES, type Book } from "@/practice/types";

const fixturePath = path.join(__dirname, "_fixture.json");
const fixture = () => JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Book;

describe("validateBook", () => {
  it("accepts the fixture with no errors or warnings", () => {
    const r = validateBook(fixture(), "_fixture.json");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("the fixture covers every question type and every diagram kind", () => {
    const qs = fixture().units.flatMap((u) => u.questions);
    expect(new Set(qs.map((q) => q.type))).toEqual(new Set(QUESTION_TYPES));
    expect(new Set(qs.filter((q) => q.diagram).map((q) => q.diagram!.kind))).toEqual(new Set(DIAGRAM_KINDS));
  });

  it("the reading unit alone covers every question type (used by the end-to-end test)", () => {
    const u = fixture().units.find((x) => x.textId)!;
    expect(new Set(u.questions.map((q) => q.type))).toEqual(new Set(QUESTION_TYPES));
  });

  it("rejects something that is not an object", () => {
    expect(validateBook([], "x.json").ok).toBe(false);
    expect(validateBook(null, "x.json").errors[0]).toMatch(/one JSON object/);
  });

  it("requires the file name to match the book id", () => {
    const r = validateBook(fixture(), "maths-y4.json");
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/must match the file name/);
  });

  const mutate = (fn: (b: any) => void) => {
    const b = fixture();
    fn(b);
    return validateBook(b, "_fixture.json");
  };

  it("names the exact problem and where it is", () => {
    const r = mutate((b) => (b.units[0].questions[0].answer = 4));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("units[0] (fixture-u01) > questions[0] (fixture-u01-q01).answer");
    expect(r.errors[0]).toContain("0 to 3");
  });

  it.each([
    ["bad key stage", (b: any) => (b.book.keyStage = "KS5"), /keyStage/],
    ["bad colour", (b: any) => (b.book.sections[0].colour = "blue"), /6-digit hex/],
    ["unknown section", (b: any) => (b.units[0].section = "NOPE"), /section ids/],
    ["missing textId", (b: any) => delete b.units[0].textId, /textId.*missing/],
    ["unknown text", (b: any) => (b.units[1].textId = "t-nope"), /textId/],
    ["duplicate question id", (b: any) => (b.units[0].questions[1].id = b.units[0].questions[0].id), /duplicate question id/],
    ["unknown type", (b: any) => (b.units[0].questions[0].type = "essay"), /must be one of/],
    ["numeric answer as string", (b: any) => (b.units[0].questions[2].answer = "14"), /must be a number/],
    ["multi answer out of range", (b: any) => (b.units[0].questions[1].answer = [0, 9]), /option indices/],
    ["cloze gap mismatch", (b: any) => (b.units[0].questions[6].answer = ["45"]), /2 gaps/],
    ["match duplicate right side", (b: any) => (b.units[0].questions[4].pairs[1][1] = "3:15"), /same right-hand side/],
    ["truefalse non-boolean", (b: any) => (b.units[0].questions[5].statements[0].a = "true"), /statements/],
    ["extended without checklist", (b: any) => (b.units[0].questions[9].checklist = []), /checklist/],
    ["difficulty out of range", (b: any) => (b.units[0].questions[0].difficulty = 6), /difficulty/],
    ["too many marks", (b: any) => (b.units[0].questions[0].marks = 4), /marks/],
    ["missing explanation", (b: any) => (b.units[0].questions[0].explanation = ""), /explanation/],
    ["unknown diagram", (b: any) => (b.units[0].questions[0].diagram = { kind: "pie" }), /diagram.kind/],
    ["bad numberline", (b: any) => (b.units[0].questions[0].diagram = { kind: "numberline", min: 10, max: 0, step: 1 }), /bigger than min/],
    ["bad clock", (b: any) => (b.units[0].questions[6].diagram = { kind: "clock", h: 25, m: 0 }), /hour 0-23/],
    ["bar chart length mismatch", (b: any) => (b.units[0].questions[9].diagram.values = [1, 2]), /2 values but 4 labels/],
    ["line reference past the end", (b: any) => (b.units[1].questions[0].prompt = "Look at line 40."), /line 40/],
    ["bad book id characters", (b: any) => (b.book.id = "Bad Id"), /lowercase/],
    ["order duplicate", (b: any) => (b.units[1].questions[3].items[1] = b.units[1].questions[3].items[0]), /same item twice/],
  ])("catches: %s", (_name, fn, re) => {
    const r = mutate(fn);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(re);
  });

  it("warns, but does not fail, when a unit does not have 10 questions", () => {
    const r = mutate((b) => b.units[0].questions.pop());
    expect(r.ok).toBe(true);
    expect(r.warnings.join("\n")).toMatch(/expects 10 questions/);
  });
});
