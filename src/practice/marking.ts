// Marking rules. Pure functions, unit tested in tests/marking.test.ts.

import type { Question } from "./types";

export type Response =
  | { type: "mcq"; choice: number | null }
  | { type: "multi"; choices: number[] }
  | { type: "numeric"; value: string }
  | { type: "text"; value: string }
  | { type: "order"; order: number[] } // indices into q.items, in the learner's order
  | { type: "match"; picks: (number | null)[] } // picks[leftIndex] = index of the pair whose right side was chosen
  | { type: "truefalse"; values: (boolean | null)[] }
  | { type: "cloze"; values: string[] }
  | { type: "extended"; written: string; ticked: number[] };

export interface MarkResult {
  correct: boolean;
  marksAwarded: number;
  marksAvailable: number;
}

/** Lower-case, straighten curly quotes, collapse spaces, drop a final full stop. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\.+$/, "")
    .trim();
}

/** Parse a typed number. Accepts "1,250", "−3", "£4.50", "12 cm", "0.5", "1/2", "2 1/2". Returns null if not a number. */
export function parseNumber(raw: string, unit?: string): number | null {
  let s = raw.normalize("NFKC").trim().replace(/−/g, "-").replace(/\s+/g, " ");
  if (unit) {
    const u = unit.trim().toLowerCase();
    if (u && s.toLowerCase().endsWith(u)) s = s.slice(0, s.length - u.length).trim();
  }
  s = s.replace(/^£\s*/, "").replace(/^\$\s*/, "").replace(/\s*(%|p)$/i, "").trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  let m = s.match(/^(-?)(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[3]) !== 0) return (m[1] ? -1 : 1) * (Number(m[2]) / Number(m[3]));
  m = s.match(/^(-?)(\d+) (\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[4]) !== 0) return (m[1] ? -1 : 1) * (Number(m[2]) + Number(m[3]) / Number(m[4]));
  return null;
}

const compact = (s: string) => normaliseText(s).replace(/\s+/g, "");

export function isResponseComplete(q: Question, r: Response | null): boolean {
  if (!r || r.type !== q.type) return false;
  switch (r.type) {
    case "mcq": return r.choice !== null;
    case "multi": return r.choices.length > 0;
    case "numeric":
    case "text": return r.value.trim().length > 0;
    case "order": return r.order.length === (q.type === "order" ? q.items.length : 0);
    case "match": return r.picks.every((p) => p !== null);
    case "truefalse": return r.values.every((v) => v !== null);
    case "cloze": return r.values.every((v) => v.trim().length > 0);
    case "extended": return true;
  }
}

export function markQuestion(q: Question, r: Response): MarkResult {
  const marksAvailable = q.marks;
  const all = (ok: boolean): MarkResult => ({ correct: ok, marksAwarded: ok ? marksAvailable : 0, marksAvailable });
  if (r.type !== q.type) return all(false);

  switch (q.type) {
    case "mcq":
      return all((r as { choice: number | null }).choice === q.answer);
    case "multi": {
      const got = [...new Set((r as { choices: number[] }).choices)].sort((a, b) => a - b);
      const want = [...q.answer].sort((a, b) => a - b);
      return all(got.length === want.length && got.every((v, i) => v === want[i]));
    }
    case "numeric": {
      const raw = (r as { value: string }).value;
      if (q.accept?.some((a) => compact(a) === compact(raw))) return all(true);
      const n = parseNumber(raw, q.unit);
      if (n === null) return all(false);
      const tol = q.tolerance ?? 0;
      return all(Math.abs(n - q.answer) <= tol + 1e-9);
    }
    case "text": {
      const got = normaliseText((r as { value: string }).value);
      return all([q.answer, ...(q.accept ?? [])].some((a) => normaliseText(a) === got));
    }
    case "order": {
      const order = (r as { order: number[] }).order;
      return all(order.length === q.items.length && order.every((v, i) => v === i));
    }
    case "match": {
      const picks = (r as { picks: (number | null)[] }).picks;
      return all(picks.length === q.pairs.length && picks.every((p, i) => p === i));
    }
    case "truefalse": {
      const vals = (r as { values: (boolean | null)[] }).values;
      return all(vals.length === q.statements.length && q.statements.every((s, i) => vals[i] === s.a));
    }
    case "cloze": {
      const vals = (r as { values: string[] }).values;
      return all(
        vals.length === q.answer.length &&
          q.answer.every((a, i) => [a, ...(q.accept?.[i] ?? [])].some((x) => normaliseText(x) === normaliseText(vals[i] ?? ""))),
      );
    }
    case "extended": {
      const ticked = new Set((r as { ticked: number[] }).ticked.filter((t) => t >= 0 && t < q.checklist.length));
      const awarded = Math.round((ticked.size / q.checklist.length) * marksAvailable);
      return { correct: awarded * 2 >= marksAvailable && awarded > 0, marksAwarded: awarded, marksAvailable };
    }
  }
}

/** A plain-words version of the right answer, shown after marking. */
export function answerText(q: Question): string {
  switch (q.type) {
    case "mcq": return q.options[q.answer];
    case "multi": return q.answer.map((i) => q.options[i]).join("; ");
    case "numeric": return `${formatNumber(q.answer)}${q.unit ? " " + q.unit : ""}`;
    case "text": return q.answer;
    case "order": return q.items.join(", then ");
    case "match": return q.pairs.map(([l, rr]) => `${l}: ${rr}`).join("; ");
    case "truefalse": return q.statements.map((s) => `${s.s} (${s.a ? "true" : "false"})`).join("; ");
    case "cloze": return q.answer.join(", ");
    case "extended": return q.model;
  }
}

export function formatNumber(n: number): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(n) ? String(abs) : String(Number(abs.toFixed(6)));
  const [int, dec] = s.split(".");
  const withCommas = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  return (n < 0 ? "-" : "") + withCommas + (dec ? "." + dec : "");
}

/** Deterministic shuffle (seeded) that never returns the original order when length > 1. */
export function shuffledIndices(length: number, seed: string): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  if (length < 2) return idx;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (idx.every((v, i) => v === i)) idx.push(idx.shift()!);
  return idx;
}

/** The learner's answer in plain words, for the mistakes page. */
export function describeResponse(q: Question, r: Response | null): string {
  if (!r || r.type !== q.type) return "No answer";
  switch (r.type) {
    case "mcq": return r.choice === null ? "No answer" : (q as { options: string[] }).options[r.choice];
    case "multi": return r.choices.length ? r.choices.map((i) => (q as { options: string[] }).options[i]).join("; ") : "No answer";
    case "numeric":
    case "text": return r.value.trim() || "No answer";
    case "order": return r.order.map((i) => (q as { items: string[] }).items[i]).join(", then ");
    case "match": {
      const pairs = (q as { pairs: [string, string][] }).pairs;
      return r.picks.map((p, i) => `${pairs[i][0]}: ${p === null ? "(none)" : pairs[p][1]}`).join("; ");
    }
    case "truefalse": {
      const st = (q as { statements: { s: string }[] }).statements;
      return r.values.map((v, i) => `${st[i].s} (${v === null ? "no answer" : v ? "true" : "false"})`).join("; ");
    }
    case "cloze": return r.values.map((v) => v.trim() || "(blank)").join(", ");
    case "extended": return r.written.trim() || "(written on paper)";
  }
}
