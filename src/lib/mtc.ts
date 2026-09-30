/**
 * Year 4 multiplication tables check (MTC) practice generator.
 *
 * Rules are stored in assessment_rules (assessment 'mtc'). The values below are the defaults used
 * until the STA guidance is harvested and verified (ingest/sources/sta_mtc_guidance.ts overwrites
 * the rows with verification_status 'verified' and logs any difference).
 */
export interface MtcRules {
  questionCount: number; // scored questions
  secondsPerQuestion: number;
  pauseSeconds: number; // gap between questions
  practiceCount: number; // unscored "try it out" questions before the check
  minTable: number;
  maxTable: number;
  maxFactor: number;
  emphasisTables: number[]; // tables that should appear more often
  minEmphasisQuestions: number;
  allowCommutativePairs: boolean; // 3x4 and 4x3 in the same check
}

export const MTC_DEFAULT_RULES: MtcRules = {
  questionCount: 25,
  secondsPerQuestion: 6,
  pauseSeconds: 3,
  practiceCount: 3,
  minTable: 2,
  maxTable: 12,
  maxFactor: 12,
  emphasisTables: [6, 7, 8, 9, 12],
  minEmphasisQuestions: 13,
  allowCommutativePairs: false,
};

export const MTC_RULE_DOCS: Array<{ key: keyof MtcRules; description: string; confidence: "high" | "medium" }> = [
  { key: "questionCount", description: "The check has 25 scored questions.", confidence: "high" },
  { key: "secondsPerQuestion", description: "Pupils have 6 seconds to answer each question.", confidence: "high" },
  { key: "pauseSeconds", description: "There is a 3-second pause between questions.", confidence: "high" },
  { key: "practiceCount", description: "Pupils answer 3 practice questions before the check starts; these are not scored.", confidence: "high" },
  { key: "minTable", description: "Questions come from the 2 to 12 multiplication tables (no ×0 or ×1 facts).", confidence: "medium" },
  { key: "maxTable", description: "The highest table is 12 (facts up to 12 × 12).", confidence: "high" },
  { key: "emphasisTables", description: "The 6, 7, 8, 9 and 12 tables are weighted to appear more often.", confidence: "medium" },
  { key: "minEmphasisQuestions", description: "Platform default: at least 13 of 25 questions come from the emphasis tables (exact official weighting to be verified).", confidence: "medium" },
  { key: "allowCommutativePairs", description: "A fact and its reverse (e.g. 6 × 7 and 7 × 6) are not both asked in one check.", confidence: "medium" },
];

export interface MtcQuestion {
  a: number;
  b: number;
  answer: number;
  practice: boolean;
}

/** Small deterministic PRNG so a seed reproduces a check (useful for tests and review). */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMtc(seed = Date.now(), rules: MtcRules = MTC_DEFAULT_RULES): MtcQuestion[] {
  const rand = mulberry32(seed);
  const facts: Array<[number, number]> = [];
  for (let a = rules.minTable; a <= rules.maxTable; a++)
    for (let b = rules.minTable; b <= rules.maxFactor; b++) facts.push([a, b]);
  const shuffle = <T,>(arr: T[]) => {
    const x = [...arr];
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  const key = (a: number, b: number) => (rules.allowCommutativePairs ? `${a}x${b}` : `${Math.min(a, b)}x${Math.max(a, b)}`);
  const used = new Set<string>();
  const picked: Array<[number, number]> = [];
  const isEmph = ([a, b]: [number, number]) => rules.emphasisTables.includes(a) || rules.emphasisTables.includes(b);

  for (const f of shuffle(facts.filter(isEmph))) {
    if (picked.length >= rules.minEmphasisQuestions) break;
    if (used.has(key(...f))) continue;
    used.add(key(...f));
    picked.push(f);
  }
  for (const f of shuffle(facts)) {
    if (picked.length >= rules.questionCount) break;
    if (used.has(key(...f))) continue;
    used.add(key(...f));
    picked.push(f);
  }
  const scored = shuffle(picked).map(([a, b]) => ({ a, b, answer: a * b, practice: false }));
  // practice questions: easy facts not used in the scored set
  const practice: MtcQuestion[] = [];
  for (const f of shuffle(facts.filter(([a, b]) => [2, 5, 10].includes(a) && b <= 10))) {
    if (practice.length >= rules.practiceCount) break;
    if (used.has(key(...f))) continue;
    used.add(key(...f));
    practice.push({ a: f[0], b: f[1], answer: f[0] * f[1], practice: true });
  }
  return [...practice, ...scored];
}

/** Validates a generated check against the rules; returns a list of violations (empty = compliant). */
export function validateMtc(qs: MtcQuestion[], rules: MtcRules = MTC_DEFAULT_RULES): string[] {
  const errs: string[] = [];
  const scored = qs.filter((q) => !q.practice);
  const practice = qs.filter((q) => q.practice);
  if (scored.length !== rules.questionCount) errs.push(`expected ${rules.questionCount} scored questions, got ${scored.length}`);
  if (practice.length !== rules.practiceCount) errs.push(`expected ${rules.practiceCount} practice questions, got ${practice.length}`);
  const seen = new Set<string>();
  for (const q of scored) {
    if (q.a < rules.minTable || q.a > rules.maxTable || q.b < rules.minTable || q.b > rules.maxFactor) errs.push(`fact out of range ${q.a}x${q.b}`);
    if (q.answer !== q.a * q.b) errs.push(`wrong answer for ${q.a}x${q.b}`);
    const k = rules.allowCommutativePairs ? `${q.a}x${q.b}` : `${Math.min(q.a, q.b)}x${Math.max(q.a, q.b)}`;
    if (seen.has(k)) errs.push(`duplicate fact ${k}`);
    seen.add(k);
  }
  const emph = scored.filter((q) => rules.emphasisTables.includes(q.a) || rules.emphasisTables.includes(q.b)).length;
  if (emph < rules.minEmphasisQuestions) errs.push(`only ${emph} emphasis-table questions`);
  return errs;
}

export function markMtc(q: MtcQuestion, typed: string, elapsedMs: number, rules: MtcRules = MTC_DEFAULT_RULES): boolean {
  if (elapsedMs > rules.secondsPerQuestion * 1000) return false;
  const n = Number(typed.trim());
  return typed.trim() !== "" && Number.isInteger(n) && n === q.answer;
}
