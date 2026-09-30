import { describe, expect, it } from "vitest";
import { scoresByStatement, scoresByRef, weakAreas, streakDays, starsFor, totalStars, topicProgressDeltas, type AttemptLite } from "../src/lib/progress";

const results = [
  { attempt_id: "a1", marks_awarded: 1, max_marks: 1, statement_ids_json: JSON.stringify(["s1", "s2"]) },
  { attempt_id: "a1", marks_awarded: 0, max_marks: 2, statement_ids_json: JSON.stringify(["s1"]) },
  { attempt_id: "a2", marks_awarded: 0, max_marks: 1, statement_ids_json: JSON.stringify(["s1", "s1"]) },
  { attempt_id: "a2", marks_awarded: 1, max_marks: 1, statement_ids_json: null },
];

describe("scores by statement", () => {
  it("sums marks per statement and counts attempts once", () => {
    const s = Object.fromEntries(scoresByStatement(results).map((x) => [x.key, x]));
    expect(s.s1).toMatchObject({ marks: 1, max: 4, pct: 25, attempts: 2 });
    expect(s.s2).toMatchObject({ marks: 1, max: 1, pct: 100, attempts: 1 });
  });
  it("weak areas need evidence and are below threshold", () => {
    const w = weakAreas(scoresByStatement(results));
    expect(w.map((x) => x.key)).toEqual(["s1"]);
  });
});

const att = (id: string, finished: string | null, score: number, max: number, ref = "p1"): AttemptLite => ({ id, kind: "paper", ref_id: ref, title: ref, started_at: finished ?? "2026-01-01T00:00:00Z", finished_at: finished, score, max_score: max });

describe("scores by paper", () => {
  it("tracks best and latest", () => {
    const r = scoresByRef([att("1", "2026-03-01T10:00:00Z", 30, 40), att("2", "2026-03-02T10:00:00Z", 20, 40), att("3", null, 0, 40)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ best: 75, latest: 50, attempts: 2 });
  });
});

describe("streaks", () => {
  const now = "2026-03-10T12:00:00Z";
  it("counts consecutive UK days ending today", () => {
    expect(streakDays([att("a", "2026-03-10T08:00:00Z", 1, 1), att("b", "2026-03-09T20:00:00Z", 1, 1), att("c", "2026-03-08T07:00:00Z", 1, 1)], now)).toBe(3);
  });
  it("keeps yesterday's streak alive until today is practised", () => {
    expect(streakDays([att("b", "2026-03-09T20:00:00Z", 1, 1)], now)).toBe(1);
  });
  it("breaks after a missed day and ignores unfinished attempts", () => {
    expect(streakDays([att("c", "2026-03-07T20:00:00Z", 1, 1)], now)).toBe(0);
    expect(streakDays([att("d", null, 1, 1)], now)).toBe(0);
  });
  it("uses UK time (late-evening BST session counts for that day)", () => {
    // 23:30 UTC on 1 July is 00:30 BST on 2 July
    expect(streakDays([att("e", "2026-07-01T23:30:00Z", 1, 1)], "2026-07-02T10:00:00Z")).toBe(1);
  });
});

describe("stars", () => {
  it.each([[0, 10, 0], [5, 10, 1], [8, 10, 2], [10, 10, 3], [1, 0, 0]])("%i/%i -> %i", (s, m, n) => expect(starsFor(s, m)).toBe(n));
  it("totals only finished attempts", () => expect(totalStars([att("1", "2026-01-01T00:00:00Z", 10, 10), att("2", null, 10, 10)])).toBe(3));
});

describe("topic progress deltas", () => {
  it("builds statement and paper deltas", () => {
    const d = topicProgressDeltas("kid", results.slice(0, 2), [{ key: "paper:p1", kind: "paper" }]);
    const byKey = Object.fromEntries(d.map((x) => [x.topic_key, x]));
    expect(byKey.s1).toMatchObject({ marks: 1, max: 3, topic_kind: "statement" });
    expect(byKey["paper:p1"]).toMatchObject({ marks: 1, max: 3, topic_kind: "paper" });
  });
});
