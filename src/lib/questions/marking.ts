import type { MarkResult, QAnswer, QuestionForMarking, Response } from "./types";

const truthy = (v: unknown) => v === true || v === 1 || v === "1";

/** Normalise free text the way a fair human marker would: trim, collapse spaces, curly quotes, trailing full stop. */
export function normaliseText(s: string, caseSensitive = false): string {
  let t = s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]+$/, "")
    .trim();
  if (!caseSensitive) t = t.toLowerCase();
  return t;
}

/**
 * Parse a numeric answer as typed by a child: "1,250", "£3.50", "3.5cm", "-4", "½", "1 1/2", "3/4".
 * Returns null if it is not a number.
 */
export function parseNumber(raw: string): number | null {
  // Vulgar fractions first: NFKC would turn "1½" into "11⁄2".
  const vulgar: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅛": "1/8" };
  let s = raw.trim().replace(/(\d)?\s*([½¼¾⅓⅔⅕⅛])/g, (_m, d: string | undefined, ch: string) => `${d ? d + " " : ""}${vulgar[ch]}`);
  s = s.normalize("NFKC").replace(/\u2044/g, "/").trim().toLowerCase();
  s = s.replace(/^[£$€]/, "").replace(/(p|cm|mm|m|km|g|kg|ml|l|°|%|degrees)$/i, "").trim();
  s = s.replace(/−/g, "-");
  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = Number(mixed[2]) / Number(mixed[3]);
    return whole < 0 ? whole - frac : whole + frac;
  }
  const frac = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  if (/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^-?\.\d+$/.test(s)) return Number(s.replace(/,/g, ""));
  return null;
}

/** For kind 'numeric' the typed form must be a number equal to the answer (within tolerance). */
function numericMatches(given: string, a: QAnswer): boolean {
  const g = parseNumber(given);
  const want = parseNumber(a.answer);
  if (g === null || want === null) return false;
  if (a.kind === "numeric") {
    // a fraction typed for a decimal answer (or vice versa) is only accepted via kind 'fraction'
    const typedFraction = /\//.test(given) || /[½¼¾⅓⅔⅕⅛]/.test(given);
    const wantFraction = /\//.test(a.answer) || /[½¼¾⅓⅔⅕⅛]/.test(a.answer);
    if (typedFraction !== wantFraction) return false;
  }
  const tol = a.tolerance ?? 1e-9;
  return Math.abs(g - want) <= tol;
}

function answerMatches(given: string, a: QAnswer): boolean {
  const kind = a.kind ?? "exact";
  if (kind === "numeric" || kind === "fraction") return numericMatches(given, a);
  if (kind === "regex") {
    try {
      return new RegExp(a.answer, truthy(a.case_sensitive) ? "" : "i").test(given.trim());
    } catch {
      return false;
    }
  }
  const cs = truthy(a.case_sensitive);
  return normaliseText(given, cs) === normaliseText(a.answer, cs);
}

export function markQuestion(q: QuestionForMarking, response: Response | null | undefined): MarkResult {
  const max = q.marks;
  const none: MarkResult = { marksAwarded: 0, maxMarks: max, correct: false };
  if (!response) return none;
  const full = (ok: boolean): MarkResult => ({ marksAwarded: ok ? max : 0, maxMarks: max, correct: ok });

  switch (q.qtype) {
    case "mcq": {
      if (!("optionId" in response)) return none;
      const opt = q.options.find((o) => o.id === response.optionId);
      return full(!!opt && truthy(opt.is_correct));
    }
    case "multi_select": {
      if (!("optionIds" in response)) return none;
      const want = new Set(q.options.filter((o) => truthy(o.is_correct)).map((o) => o.id));
      const got = new Set(response.optionIds);
      return full(want.size > 0 && want.size === got.size && [...want].every((id) => got.has(id)));
    }
    case "numeric":
    case "text_exact": {
      if (!("value" in response) || typeof response.value !== "string" || !response.value.trim()) return none;
      const mains = q.answers.filter((a) => (a.part ?? "main") === "main");
      return full(mains.some((a) => answerMatches(response.value, q.qtype === "numeric" && !a.kind ? { ...a, kind: "numeric" } : a)));
    }
    case "ordering": {
      if (!("order" in response)) return none;
      const expected = [...q.options]
        .filter((o) => o.correct_position != null)
        .sort((a, b) => (a.correct_position ?? 0) - (b.correct_position ?? 0))
        .map((o) => o.id);
      return full(expected.length > 0 && expected.length === response.order.length && expected.every((id, i) => response.order[i] === id));
    }
    case "matching": {
      if (!("pairs" in response)) return none;
      const lefts = q.options.filter((o) => o.side === "L");
      const parts: Record<string, boolean> = {};
      for (const l of lefts) {
        const r = q.options.find((o) => o.id === response.pairs[l.id]);
        parts[l.id] = !!r && r.side === "R" && r.match_key === l.match_key;
      }
      const ok = lefts.length > 0 && Object.values(parts).every(Boolean);
      return { ...full(ok), parts };
    }
    case "table_fill": {
      if (!("cells" in response)) return none;
      const byPart = new Map<string, QAnswer[]>();
      for (const a of q.answers) byPart.set(a.part ?? "main", [...(byPart.get(a.part ?? "main") ?? []), a]);
      const parts: Record<string, boolean> = {};
      for (const [part, alts] of byPart) {
        const given = response.cells[part] ?? "";
        parts[part] = given.trim() !== "" && alts.some((a) => answerMatches(given, a));
      }
      const perCell = q.answers.some((a) => a.marks != null);
      if (perCell) {
        let awarded = 0;
        for (const [part, alts] of byPart) if (parts[part]) awarded += alts[0].marks ?? 0;
        awarded = Math.min(awarded, max);
        return { marksAwarded: awarded, maxMarks: max, correct: awarded === max, parts };
      }
      const ok = byPart.size > 0 && Object.values(parts).every(Boolean);
      return { ...full(ok), parts };
    }
    case "self_mark": {
      if (!("awarded" in response)) return none;
      const a = Math.max(0, Math.min(max, Math.round(Number(response.awarded) || 0)));
      return { marksAwarded: a, maxMarks: max, correct: a === max, selfMarked: true };
    }
    default:
      return none;
  }
}

/** Questions that can be marked without a human. */
export const isAutoMarked = (t: string) => t !== "self_mark";
