import { describe, expect, it } from "vitest";
import { keywords, recommend } from "../src/lib/recommend";
import type { BookSummary } from "../src/practice/types";

const unit = (id: string, title: string, section = "s") => ({ id, section, title, bookPages: [1], hasText: false, questionCount: 10 });
const book = (id: string, ks: "KS1" | "KS2", units: ReturnType<typeof unit>[]): BookSummary => ({
  fixture: false, units,
  meta: { id, title: `Book ${id}`, keyStage: ks, year: "Year 3", subject: "Maths", pages: 10, ageRange: "7-8", sections: [{ id: "s", name: "S", colour: "#2360A8" }] },
});
const maths = book("m", "KS2", [unit("m1", "Multiplication facts"), unit("m2", "Multiplying by 10 and 100"), unit("m3", "Subtraction with exchange"), unit("m4", "Place value to 1000"), unit("m5", "Telling the time")]);
const other = book("o", "KS2", [unit("o1", "Reading poems")]);
const sess = (unitId: string, day: string, score: number) => ({ unitId, bookId: "m", day, completedAt: `${day}T10:00:00.000Z`, score, maxScore: 10 });
const base = { today: "2026-10-10", books: [maths, other], owned: new Set(["m"]) };

describe("keywords", () => {
  it("drops filler and stems so related topics share words", () => {
    expect(keywords("Multiplication facts")).toEqual(expect.arrayContaining(["multip", "fact"]));
    expect(keywords("Multiplying by 10 and 100")).toContain("multip");
  });
});

describe("recommend", () => {
  it("suggests the first topics of an owned book for a brand new learner, and a teaser for the book they do not own", () => {
    const r = recommend({ ...base, sessions: [] });
    expect(r.items.find((x) => x.kind === "next")?.title).toBe("Multiplication facts");
    const teaser = r.items.find((x) => x.kind === "unlock")!;
    expect(teaser.bookId).toBe("o");
    expect(teaser.reason).toMatch(/printed book/);
  });
  it("never offers topics from a book that is not owned as playable recommendations", () => {
    const r = recommend({ ...base, sessions: [sess("m1", "2026-10-01", 5)] });
    expect(r.items.filter((x) => x.kind !== "unlock").every((x) => x.bookId === "m")).toBe(true);
  });
  it("puts topics that are due for review first, weakest first", () => {
    const r = recommend({ ...base, sessions: [sess("m3", "2026-10-01", 4), sess("m5", "2026-10-02", 6)] });
    expect(r.items[0]).toMatchObject({ kind: "review", title: "Subtraction with exchange" });
    expect(r.items[0].reason).toMatch(/40%/);
  });
  it("links a tricky topic to related ones and names the struggling area", () => {
    const r = recommend({ ...base, sessions: [sess("m1", "2026-10-09", 4)] });
    const s = r.items.find((x) => x.kind === "strengthen");
    expect(s?.title).toBe("Multiplying by 10 and 100");
    expect(s?.reason).toMatch(/Multiplication facts/);
    expect(r.struggling.map((x) => x.word)).toContain("multiplication");
  });
  it("does not recommend secure topics or repeat a topic", () => {
    const r = recommend({ ...base, sessions: [sess("m4", "2026-10-01", 9), sess("m4", "2026-10-05", 9), sess("m1", "2026-10-09", 4)] });
    expect(r.items.find((x) => x.title === "Place value to 1000")).toBeUndefined();
    expect(new Set(r.items.map((x) => x.id)).size).toBe(r.items.length);
  });
  it("respects the limit", () => {
    expect(recommend({ ...base, sessions: [], limit: 2 }).items.length).toBeLessThanOrEqual(2);
  });
});
