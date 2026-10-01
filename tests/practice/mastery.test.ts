import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysLeft, unitStatus, type SessionLike } from "@/practice/mastery";
import { demoCodeFor, formatCode, generateCode, isValidOrderNumber, normaliseCode, normaliseOrderNumber } from "@/practice/codes";
import { contrast, textSafe, tint } from "@/practice/colour";

const s = (day: string, score: number, max = 10): SessionLike => ({ unitId: "u", score, maxScore: max, day, completedAt: `${day}T10:00:00Z` });

describe("unitStatus", () => {
  it("not started", () => {
    expect(unitStatus([], "2026-10-01").state).toBe("not-started");
  });
  it("8/10 twice on the same day is not secure", () => {
    const st = unitStatus([s("2026-10-01", 8), s("2026-10-01", 9)], "2026-10-01");
    expect(st.state).toBe("practising");
    expect(st.goodDays).toBe(1);
  });
  it("8/10 on two different days is secure", () => {
    const st = unitStatus([s("2026-10-01", 8), s("2026-10-03", 10)], "2026-10-03");
    expect(st.state).toBe("secure");
    expect(st.due).toBe(false);
    expect(st.nextDueDay).toBeNull();
  });
  it("7/10 does not count towards secure", () => {
    expect(unitStatus([s("2026-10-01", 7), s("2026-10-02", 8)], "2026-10-02").state).toBe("practising");
  });
  it("works with percentages when marks are not out of 10", () => {
    expect(unitStatus([s("2026-10-01", 12, 15), s("2026-10-02", 13, 15)]).state).toBe("secure");
  });
  it("review comes round after 1, 3, then 7 days", () => {
    expect(unitStatus([s("2026-10-01", 3)], "2026-10-01").nextDueDay).toBe("2026-10-02");
    expect(unitStatus([s("2026-10-01", 3)], "2026-10-01").due).toBe(false);
    expect(unitStatus([s("2026-10-01", 3)], "2026-10-02").due).toBe(true);
    expect(unitStatus([s("2026-10-01", 3), s("2026-10-02", 5)], "2026-10-02").nextDueDay).toBe("2026-10-05");
    expect(unitStatus([s("2026-10-01", 3), s("2026-10-02", 5), s("2026-10-05", 6)], "2026-10-05").nextDueDay).toBe("2026-10-12");
    expect(unitStatus([s("2026-10-01", 3), s("2026-10-02", 5), s("2026-10-05", 6), s("2026-10-12", 6)], "2026-10-12").nextDueDay).toBe("2026-10-19");
  });
});

describe("dates", () => {
  it("addDays crosses months", () => expect(addDays("2026-10-30", 3)).toBe("2026-11-02"));
  it("addMonths clamps to the end of the month", () => {
    expect(addMonths(new Date("2026-08-31T12:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(addMonths(new Date("2026-10-01T12:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2027-04-01");
  });
  it("daysLeft", () => {
    expect(daysLeft("2026-10-11T00:00:00Z", new Date("2026-10-01T00:00:00Z"))).toBe(10);
    expect(daysLeft("2026-09-01T00:00:00Z", new Date("2026-10-01T00:00:00Z"))).toBe(0);
  });
});

describe("codes and order numbers", () => {
  it("normalises codes", () => {
    expect(normaliseCode(" ink-abcd efgh ")).toBe("INKABCDEFGH");
    expect(formatCode("inkabcdefgh")).toBe("INK-ABCD-EFGH");
    expect(demoCodeFor("fixture")).toBe("DEMO-FIXTURE");
  });
  it("generates codes from the safe alphabet", () => {
    let i = 0;
    const bytes = (n: number) => Uint8Array.from({ length: n }, () => (i = (i * 37 + 11) % 256));
    const c = generateCode(bytes);
    expect(c).toMatch(/^INK[ACDEFGHJKMNPQRTUVWXY34679]{8}$/);
  });
  it("checks Amazon order numbers (3-7-7 digits)", () => {
    expect(isValidOrderNumber("203-1234567-1234567")).toBe(true);
    expect(isValidOrderNumber(" 203 1234567 1234567 ")).toBe(true); // spaces are forgiven
    expect(isValidOrderNumber("20312345671234567")).toBe(true);
    expect(normaliseOrderNumber("20312345671234567")).toBe("203-1234567-1234567");
    expect(isValidOrderNumber("203–1234567–1234567")).toBe(true);
    expect(isValidOrderNumber("D01-1234567-1234567")).toBe(false);
    expect(isValidOrderNumber("203-123456-1234567")).toBe(false);
  });
});

describe("section colours", () => {
  it("text colour passes WCAG AA on white and on the tint", () => {
    for (const c of ["#2360A8", "#F2B705", "#8A3B8F", "#1E9E5A", "#E85D04", "#00A6D6"]) {
      expect(contrast(textSafe(c), "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(textSafe(c), tint(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
