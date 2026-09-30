/**
 * Original arithmetic practice papers modelled on the published structure of the STA
 * arithmetic tests (KS2: 36 questions, 40 marks, 30 minutes, two-mark long multiplication
 * and long division; KS1: 25 questions, 25 marks, about 20 minutes).
 * Every question and answer is generated here and computed exactly; nothing is copied from a paper.
 */
import { Q, fmt } from "./rational";
import { mulberry32 } from "../mtc";

export interface ArithItem {
  prompt: string;
  answer: Q;
  answerForm: "integer" | "decimal" | "fraction";
  marks: number;
  skill: ArithSkill;
  explanation: string;
}

export type ArithSkill =
  | "mental_add_sub"
  | "mental_mult_div"
  | "column_add"
  | "column_sub"
  | "short_mult"
  | "short_div"
  | "long_mult"
  | "long_div"
  | "mult_div_powers_of_10"
  | "decimal_add_sub"
  | "decimal_mult"
  | "fraction_add_sub"
  | "fraction_mult"
  | "fraction_div"
  | "fraction_of_amount"
  | "percent_of_amount"
  | "order_of_operations"
  | "squares_cubes"
  | "missing_number"
  | "ks1_add_sub"
  | "ks1_mult_div"
  | "ks1_fraction_of";

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rand, xs: T[]) => xs[Math.floor(r() * xs.length)];
const frac = (q: Q) => (q.d === 1 ? `${q.n}` : `${q.n}/${q.d}`);

function item(prompt: string, answer: Q, skill: ArithSkill, explanation: string, marks = 1): ArithItem {
  const answerForm = answer.isInt() ? "integer" : answer.isTerminating() && !/fraction/.test(skill) ? "decimal" : "fraction";
  return { prompt, answer, answerForm, marks, skill, explanation };
}

const G: Record<ArithSkill, (r: Rand) => ArithItem> = {
  mental_add_sub: (r) => {
    const a = int(r, 2, 9) * 100 + int(r, 0, 9) * 10;
    const b = int(r, 11, 99);
    return r() < 0.5
      ? item(`${fmt(a)} + ${b} =`, new Q(a + b), "mental_add_sub", `Add the tens and ones to ${fmt(a)}: ${fmt(a)} + ${b} = ${fmt(a + b)}.`)
      : item(`${fmt(a)} − ${b} =`, new Q(a - b), "mental_add_sub", `Count back ${b} from ${fmt(a)}: ${fmt(a - b)}.`);
  },
  mental_mult_div: (r) => {
    const a = int(r, 3, 12), b = int(r, 3, 12);
    return r() < 0.5
      ? item(`${a} × ${b} =`, new Q(a * b), "mental_mult_div", `${a} × ${b} is a times-table fact: ${a * b}.`)
      : item(`${a * b} ÷ ${a} =`, new Q(b), "mental_mult_div", `Use the fact ${a} × ${b} = ${a * b}, so ${a * b} ÷ ${a} = ${b}.`);
  },
  column_add: (r) => {
    const a = int(r, 1000, 99999), b = int(r, 100, 9999);
    return item(`${fmt(a)} + ${fmt(b)} =`, new Q(a + b), "column_add", `Line up the digits by place value and add column by column, carrying where needed: ${fmt(a + b)}.`);
  },
  column_sub: (r) => {
    const a = int(r, 10000, 99999), b = int(r, 1000, a - 1);
    return item(`${fmt(a)} − ${fmt(b)} =`, new Q(a - b), "column_sub", `Line up the digits and subtract column by column, exchanging where needed: ${fmt(a - b)}.`);
  },
  short_mult: (r) => {
    const a = int(r, 1000, 9999), b = int(r, 3, 9);
    return item(`${fmt(a)} × ${b} =`, new Q(a * b), "short_mult", `Multiply each digit of ${fmt(a)} by ${b}, starting with the ones and carrying: ${fmt(a * b)}.`);
  },
  short_div: (r) => {
    const b = int(r, 3, 9), q = int(r, 120, 1100);
    return item(`${fmt(b * q)} ÷ ${b} =`, new Q(q), "short_div", `Use short division: ${fmt(b * q)} ÷ ${b} = ${fmt(q)}. Check: ${fmt(q)} × ${b} = ${fmt(b * q)}.`);
  },
  long_mult: (r) => {
    const a = int(r, 1000, 9999), b = int(r, 12, 89);
    const t = Math.floor(b / 10) * 10, o = b % 10;
    return item(`${fmt(a)} × ${b} =`, new Q(a * b), "long_mult",
      `Long multiplication: ${fmt(a)} × ${o} = ${fmt(a * o)}; ${fmt(a)} × ${t} = ${fmt(a * t)}; add the rows: ${fmt(a * o)} + ${fmt(a * t)} = ${fmt(a * b)}.`, 2);
  },
  long_div: (r) => {
    const b = int(r, 12, 36), q = int(r, 24, 299);
    return item(`${fmt(b * q)} ÷ ${b} =`, new Q(q), "long_div", `Long division of ${fmt(b * q)} by ${b} gives ${q} with no remainder. Check: ${q} × ${b} = ${fmt(b * q)}.`, 2);
  },
  mult_div_powers_of_10: (r) => {
    const p = pick(r, [10, 100, 1000]);
    const x = Q.of(int(r, 1, 999) / pick(r, [1, 10, 100]));
    return r() < 0.5
      ? item(`${x.toDecimalString()} × ${fmt(p)} =`, x.mul(p), "mult_div_powers_of_10", `Multiplying by ${fmt(p)} moves each digit ${String(p).length - 1} place(s) to the left: ${x.mul(p).toDecimalString()}.`)
      : item(`${x.toDecimalString()} ÷ ${fmt(p)} =`, x.div(p), "mult_div_powers_of_10", `Dividing by ${fmt(p)} moves each digit ${String(p).length - 1} place(s) to the right: ${x.div(p).toDecimalString()}.`);
  },
  decimal_add_sub: (r) => {
    const a = Q.of(int(r, 100, 999) / 100), b = Q.of(int(r, 11, 99) / 10);
    return r() < 0.5
      ? item(`${a.toDecimalString()} + ${b.toDecimalString()} =`, a.add(b), "decimal_add_sub", `Line up the decimal points and add: ${a.add(b).toDecimalString()}.`)
      : item(`${a.add(10).toDecimalString()} − ${b.toDecimalString()} =`, a.add(10).sub(b), "decimal_add_sub", `Line up the decimal points and subtract: ${a.add(10).sub(b).toDecimalString()}.`);
  },
  decimal_mult: (r) => {
    const a = Q.of(int(r, 11, 99) / 10), b = int(r, 3, 9);
    return item(`${a.toDecimalString()} × ${b} =`, a.mul(b), "decimal_mult", `Work out ${a.n} × ${b} = ${a.n * b}, then divide by ${a.d}: ${a.mul(b).toDecimalString()}.`);
  },
  fraction_add_sub: (r) => {
    const d1 = pick(r, [3, 4, 5, 6, 8]), k = pick(r, [2, 3]);
    const d2 = d1 * k;
    const a = new Q(int(r, 1, d1 - 1), d1), b = new Q(int(r, 1, d2 - 1), d2);
    const add = r() < 0.6 || a.valueOf() <= b.valueOf();
    const ans = add ? a.add(b) : a.sub(b);
    return item(`${frac(a)} ${add ? "+" : "−"} ${frac(b)} =`, ans, "fraction_add_sub",
      `Write ${frac(a)} with denominator ${d2}: ${a.n * (d2 / a.d)}/${d2}. Then ${add ? "add" : "subtract"} the numerators: ${frac(ans)}${ans.valueOf() > 1 ? ` (= ${ans.toMixedString()})` : ""}.`);
  },
  fraction_mult: (r) => {
    const a = new Q(int(r, 1, 4), pick(r, [3, 5, 7])), b = new Q(int(r, 1, 3), pick(r, [2, 4, 5]));
    if (a.valueOf() >= 1 || b.valueOf() >= 1) return G.fraction_mult(r);
    return item(`${frac(a)} × ${frac(b)} =`, a.mul(b), "fraction_mult", `Multiply the numerators and the denominators, then simplify: ${frac(a.mul(b))}.`);
  },
  fraction_div: (r) => {
    const a = new Q(int(r, 1, 5), pick(r, [3, 4, 6, 7, 8])), w = int(r, 2, 5);
    if (a.valueOf() >= 1) return G.fraction_div(r);
    return item(`${frac(a)} ÷ ${w} =`, a.div(w), "fraction_div", `Dividing by ${w} is the same as multiplying by 1/${w}: ${frac(a.div(w))}.`);
  },
  fraction_of_amount: (r) => {
    const d = pick(r, [3, 4, 5, 6, 8]), n = int(r, 1, d - 1), m = int(r, 6, 60);
    return item(`${n}/${d} of ${fmt(d * m)} =`, new Q(n * m), "fraction_of_amount", `${fmt(d * m)} ÷ ${d} = ${m}, then × ${n} = ${n * m}.`);
  },
  percent_of_amount: (r) => {
    const p = pick(r, [10, 20, 25, 30, 40, 50, 60, 75, 5, 15]);
    const base = int(r, 2, 48) * 20;
    const ans = new Q(p * base, 100);
    return item(`${p}% of ${fmt(base)} =`, ans, "percent_of_amount", `${p}% means ${p} hundredths: ${fmt(base)} ÷ 100 × ${p} = ${ans.toDecimalString()}.`);
  },
  order_of_operations: (r) => {
    const a = int(r, 2, 30), b = int(r, 2, 12), c = int(r, 2, 12);
    return r() < 0.5
      ? item(`${a} + ${b} × ${c} =`, new Q(a + b * c), "order_of_operations", `Multiply first: ${b} × ${c} = ${b * c}, then add ${a}: ${a + b * c}.`)
      : item(`(${a} + ${b}) × ${c} =`, new Q((a + b) * c), "order_of_operations", `Brackets first: ${a} + ${b} = ${a + b}, then × ${c} = ${(a + b) * c}.`);
  },
  squares_cubes: (r) => {
    const cube = r() < 0.4;
    const x = cube ? int(r, 2, 6) : int(r, 3, 12);
    return cube
      ? item(`${x}³ =`, new Q(x ** 3), "squares_cubes", `${x}³ = ${x} × ${x} × ${x} = ${x ** 3}.`)
      : item(`${x}² =`, new Q(x ** 2), "squares_cubes", `${x}² = ${x} × ${x} = ${x ** 2}.`);
  },
  missing_number: (r) => {
    const a = int(r, 3, 12), b = int(r, 3, 12);
    return r() < 0.5
      ? item(`□ ÷ ${a} = ${b}   (write the missing number)`, new Q(a * b), "missing_number", `The missing number is ${a} × ${b} = ${a * b}.`)
      : item(`${fmt(a * 100)} − □ = ${fmt(a * 100 - b * 7)}   (write the missing number)`, new Q(b * 7), "missing_number", `${fmt(a * 100)} − ${fmt(a * 100 - b * 7)} = ${b * 7}.`);
  },
  ks1_add_sub: (r) => {
    const a = int(r, 10, 60), b = int(r, 2, 39);
    return r() < 0.5
      ? item(`${a} + ${b} =`, new Q(a + b), "ks1_add_sub", `${a} + ${b} = ${a + b}. Add the tens, then the ones.`)
      : item(`${a + b} − ${b} =`, new Q(a), "ks1_add_sub", `${a + b} − ${b} = ${a}. Subtract the tens, then the ones.`);
  },
  ks1_mult_div: (r) => {
    const t = pick(r, [2, 5, 10]), b = int(r, 1, 12);
    return r() < 0.5
      ? item(`${b} × ${t} =`, new Q(b * t), "ks1_mult_div", `Count in ${t}s ${b} times: ${b * t}.`)
      : item(`${b * t} ÷ ${t} =`, new Q(b), "ks1_mult_div", `How many ${t}s make ${b * t}? ${b}.`);
  },
  ks1_fraction_of: (r) => {
    const d = pick(r, [2, 4, 3]), m = int(r, 2, 10);
    const name = { 2: "½", 4: "¼", 3: "⅓" }[d]!;
    return item(`${name} of ${d * m} =`, new Q(m), "ks1_fraction_of", `Share ${d * m} into ${d} equal groups: ${m} in each.`);
  },
};

/** Paper blueprints: ordered skills, roughly easiest first, as on the real papers. */
const KS2_BLUEPRINT: ArithSkill[] = [
  "mental_add_sub", "mental_mult_div", "mental_add_sub", "mental_mult_div", "column_add", "order_of_operations",
  "mult_div_powers_of_10", "column_sub", "squares_cubes", "short_mult", "decimal_add_sub", "missing_number",
  "fraction_add_sub", "short_div", "fraction_of_amount", "percent_of_amount", "mult_div_powers_of_10", "decimal_mult",
  "column_add", "fraction_add_sub", "order_of_operations", "decimal_add_sub", "long_mult", "fraction_mult",
  "short_div", "percent_of_amount", "missing_number", "fraction_div", "long_div", "column_sub", "fraction_add_sub",
  "long_mult", "decimal_mult", "squares_cubes", "fraction_mult", "long_div",
];
const KS1_BLUEPRINT: ArithSkill[] = [
  ...Array(9).fill("ks1_add_sub"), ...Array(8).fill("ks1_mult_div"), ...Array(4).fill("ks1_fraction_of"), ...Array(4).fill("ks1_add_sub"),
] as ArithSkill[];

export interface GeneratedPaper {
  keyStage: "ks1" | "ks2";
  items: ArithItem[];
  totalMarks: number;
  minutes: number;
}

export function generateArithmeticPaper(keyStage: "ks1" | "ks2", seed: number): GeneratedPaper {
  const r = mulberry32(seed);
  const bp = keyStage === "ks2" ? KS2_BLUEPRINT : KS1_BLUEPRINT;
  const seen = new Set<string>();
  const items = bp.map((skill) => {
    for (let i = 0; i < 50; i++) {
      const it = G[skill](r);
      if (!seen.has(it.prompt)) {
        seen.add(it.prompt);
        return it;
      }
    }
    throw new Error(`could not generate unique ${skill}`);
  });
  return { keyStage, items, totalMarks: items.reduce((s, i) => s + i.marks, 0), minutes: keyStage === "ks2" ? 30 : 20 };
}

/** Accepted answers for an item, following the platform's published marking policy. */
export function acceptedAnswers(it: ArithItem): Array<{ answer: string; kind: "numeric" | "fraction" }> {
  if (it.answerForm === "fraction") {
    const out: Array<{ answer: string; kind: "numeric" | "fraction" }> = [{ answer: it.answer.toFractionString(), kind: "fraction" }];
    if (it.answer.isTerminating()) out.push({ answer: it.answer.toDecimalString(), kind: "fraction" });
    return out;
  }
  if (it.answerForm === "decimal") return [{ answer: it.answer.toDecimalString(), kind: "numeric" }];
  return [{ answer: String(it.answer.n), kind: "numeric" }];
}

/** Statement text fragments used to link each skill to National Curriculum statements. */
export const SKILL_STATEMENT_HINTS: Record<ArithSkill, string[]> = {
  mental_add_sub: ["mental calculations, including with mixed operations"],
  mental_mult_div: ["mental calculations, including with mixed operations", "recall multiplication and division facts for multiplication tables up to 12"],
  column_add: ["add and subtract whole numbers with more than 4 digits"],
  column_sub: ["add and subtract whole numbers with more than 4 digits"],
  short_mult: ["multiply numbers up to 4 digits by a one- or two-digit number"],
  short_div: ["divide numbers up to 4 digits by a one-digit number using the formal written method of short division"],
  long_mult: ["multiply multi-digit numbers up to 4 digits by a two-digit whole number using the formal written method of long multiplication"],
  long_div: ["divide numbers up to 4 digits by a two-digit whole number using the formal written method of long division"],
  mult_div_powers_of_10: ["multiply and divide whole numbers and those involving decimals by 10, 100 and 1,000"],
  decimal_add_sub: ["solve problems involving number up to 3 decimal places"],
  decimal_mult: ["multiply one-digit numbers with up to 2 decimal places by whole numbers"],
  fraction_add_sub: ["add and subtract fractions with different denominators and mixed numbers"],
  fraction_mult: ["multiply simple pairs of proper fractions"],
  fraction_div: ["divide proper fractions by whole numbers"],
  fraction_of_amount: ["fractions to calculate quantities, and fractions to divide quantities", "solve problems involving increasingly harder fractions"],
  percent_of_amount: ["calculation of percentages"],
  order_of_operations: ["order of operations"],
  squares_cubes: ["square numbers and cube numbers"],
  missing_number: ["use their knowledge of the order of operations", "solve problems involving multiplication and division"],
  ks1_add_sub: ["add and subtract numbers using concrete objects, pictorial representations, and mentally"],
  ks1_mult_div: ["recall and use multiplication and division facts for the 2, 5 and 10 multiplication tables"],
  ks1_fraction_of: ["recognise, find, name and write fractions"],
};
