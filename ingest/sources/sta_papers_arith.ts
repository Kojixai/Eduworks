/**
 * Exact arithmetic for checking STA arithmetic papers against their mark schemes.
 *
 * The checker NEVER changes an answer: it computes the value of the printed expression and reports
 * agreement / disagreement / "could not parse". Answers themselves come only from the mark scheme.
 */

// ---------------------------------------------------------------- rationals (BigInt, exact)
export class Q {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error("division by zero");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    this.n = g ? n / g : n;
    this.d = g ? d / g : d;
  }
  static int(v: number | bigint) {
    return new Q(BigInt(v));
  }
  /** Exact value of a decimal string such as "4.725" or "-0.25". */
  static dec(s: string): Q {
    const m = s.match(/^(-?)(\d*)(?:\.(\d+))?$/);
    if (!m || (!m[2] && !m[3])) throw new Error(`bad decimal ${s}`);
    const frac = m[3] ?? "";
    const n = BigInt((m[2] || "0") + frac) * (m[1] ? -1n : 1n);
    return new Q(n, 10n ** BigInt(frac.length));
  }
  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q) {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q) {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q) {
    return new Q(this.n * o.d, this.d * o.n);
  }
  pow(k: number) {
    let r = Q.int(1);
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
  eq(o: Q) {
    return this.n === o.n && this.d === o.d;
  }
  isInt() {
    return this.d === 1n;
  }
  toNumber() {
    return Number(this.n) / Number(this.d);
  }
  toString() {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

// ---------------------------------------------------------------- normalisation
const VULGAR: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5",
  "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅒": "1/10",
};
const SUPER: Record<string, string> = { "²": "^2", "³": "^3" };

export function normaliseMath(s: string): string {
  let t = s.normalize("NFC");
  // vulgar fractions: keep a space before them so "1¾" reads as a mixed number
  t = t.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅒]/g, (c) => ` ${VULGAR[c]}`);
  t = t.replace(/[²³]/g, (c) => SUPER[c]);
  t = t.replace(/[−–—]/g, "-");
  t = t.replace(/[□☐▢■]|\[\s*\]|_{2,}|\?/g, " X ");
  // thousands separators
  t = t.replace(/\b(\d{1,3})((?:,\d{3})+)(?![\d])/g, (_m, a: string, b: string) => a + b.replace(/,/g, ""));
  return t.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- tokenizer / parser
type Tok =
  | { t: "num"; v: Q }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "of" | "^" | "%" }
  | { t: "("}
  | { t: ")" }
  | { t: "X" };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let s = src;
  while (s.length) {
    s = s.replace(/^\s+/, "");
    if (!s) break;
    let m: RegExpMatchArray | null;
    // mixed number "2 3/4" (only when not preceded by an operator-less number already)
    if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d.])/)) && !(out.length && out[out.length - 1].t === "num")) {
      out.push({ t: "num", v: Q.int(BigInt(m[1])).add(new Q(BigInt(m[2]), BigInt(m[3]))) });
    } else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)(?![\d.])/))) {
      // a printed fraction literal binds tighter than any operator
      if (BigInt(m[2]) === 0n) return null;
      out.push({ t: "num", v: new Q(BigInt(m[1]), BigInt(m[2])) });
    } else if ((m = s.match(/^\d*\.?\d+/))) {
      out.push({ t: "num", v: Q.dec(m[0]) });
    } else if ((m = s.match(/^(×|x(?![a-z])|\*|·)/))) {
      out.push({ t: "op", v: "*" });
    } else if ((m = s.match(/^÷/))) {
      out.push({ t: "op", v: "/" });
    } else if ((m = s.match(/^[+\-^%]/))) {
      out.push({ t: "op", v: m[0] as "+" | "-" | "^" | "%" });
    } else if ((m = s.match(/^of\b/i))) {
      out.push({ t: "op", v: "of" });
    } else if ((m = s.match(/^X\b/))) {
      out.push({ t: "X" });
    } else if ((m = s.match(/^[()]/))) {
      out.push({ t: m[0] as "(" | ")" });
    } else return null;
    s = s.slice(m[0].length);
  }
  return out;
}

/** AST node: a number, the unknown, or a binary op. */
export type Node = { k: "num"; v: Q } | { k: "X" } | { k: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node };

function parseTokens(toks: Tok[]): Node | null {
  let i = 0;
  const peek = () => toks[i];
  // expr := term (('+'|'-') term)*
  function expr(): Node | null {
    let a = term();
    if (!a) return null;
    for (;;) {
      const p = peek();
      if (p && p.t === "op" && (p.v === "+" || p.v === "-")) {
        i++;
        const b = term();
        if (!b) return null;
        a = { k: "bin", op: p.v, a, b };
      } else return a;
    }
  }
  // term := factor (('*'|'/') factor)*
  function term(): Node | null {
    let a = factor();
    if (!a) return null;
    for (;;) {
      const p = peek();
      if (p && p.t === "op" && (p.v === "*" || p.v === "/")) {
        i++;
        const b = factor();
        if (!b) return null;
        a = { k: "bin", op: p.v, a, b };
      } else return a;
    }
  }
  // factor := unary ('of' unary)*   ("of" binds tighter than × and ÷ as in "¾ of 12")
  function factor(): Node | null {
    let a = unary();
    if (!a) return null;
    for (;;) {
      const p = peek();
      if (p && p.t === "op" && p.v === "of") {
        i++;
        const b = unary();
        if (!b) return null;
        a = { k: "bin", op: "*", a, b };
      } else return a;
    }
  }
  function unary(): Node | null {
    const p = peek();
    if (p && p.t === "op" && p.v === "-") {
      i++;
      const a = unary();
      return a ? { k: "bin", op: "-", a: { k: "num", v: Q.int(0) }, b: a } : null;
    }
    return postfix();
  }
  function postfix(): Node | null {
    let a = atom();
    if (!a) return null;
    for (;;) {
      const p = peek();
      if (p && p.t === "op" && p.v === "%") {
        i++;
        a = { k: "bin", op: "/", a, b: { k: "num", v: Q.int(100) } };
      } else if (p && p.t === "op" && p.v === "^") {
        i++;
        const e = toks[i++];
        if (!e || e.t !== "num" || !e.v.isInt() || e.v.n > 6n || a.k !== "num") return null;
        a = { k: "num", v: a.v.pow(Number(e.v.n)) };
      } else return a;
    }
  }
  function atom(): Node | null {
    const p = toks[i++];
    if (!p) return null;
    if (p.t === "num") return { k: "num", v: p.v };
    if (p.t === "X") return { k: "X" };
    if (p.t === "(") {
      const e = expr();
      if (!e || toks[i++]?.t !== ")") return null;
      return e;
    }
    return null;
  }
  const n = expr();
  return n && i === toks.length ? n : null;
}

function hasX(n: Node): boolean {
  return n.k === "X" || (n.k === "bin" && (hasX(n.a) || hasX(n.b)));
}
function countX(n: Node): number {
  return n.k === "X" ? 1 : n.k === "bin" ? countX(n.a) + countX(n.b) : 0;
}
export function evaluate(n: Node): Q {
  if (n.k === "num") return n.v;
  if (n.k === "X") throw new Error("unknown");
  const a = evaluate(n.a);
  const b = evaluate(n.b);
  switch (n.op) {
    case "+":
      return a.add(b);
    case "-":
      return a.sub(b);
    case "*":
      return a.mul(b);
    case "/":
      return a.div(b);
  }
}
/** Solve node == target for the single unknown X. */
function solve(n: Node, target: Q): Q {
  if (n.k === "X") return target;
  if (n.k !== "bin") throw new Error("no unknown");
  if (hasX(n.a)) {
    const b = evaluate(n.b);
    const next = n.op === "+" ? target.sub(b) : n.op === "-" ? target.add(b) : n.op === "*" ? target.div(b) : target.mul(b);
    return solve(n.a, next);
  }
  const a = evaluate(n.a);
  const next = n.op === "+" ? target.sub(a) : n.op === "-" ? a.sub(target) : n.op === "*" ? target.div(a) : a.div(target);
  return solve(n.b, next);
}

export interface ExprResult {
  expression: string;
  value: Q;
  /** 'value' = the expression's result; 'missing' = the value of the missing number box */
  kind: "value" | "missing";
}

/** Parse and compute one printed arithmetic line such as "345 + 211 =", "¾ of 12", "□ + 5 = 12". */
export function computeLine(line: string): ExprResult | null {
  const norm = normaliseMath(line);
  if (!/\d/.test(norm)) return null;
  const sides = norm.split("=");
  if (sides.length > 2) return null;
  try {
    if (sides.length === 1) {
      const t = tokenize(sides[0]);
      const n = t && parseTokens(t);
      if (!n || hasX(n) || !(n.k === "bin")) return null;
      return { expression: line.trim(), value: evaluate(n), kind: "value" };
    }
    const [l, r] = sides.map((s) => s.trim());
    const ln = l ? (() => { const t = tokenize(l); return t && parseTokens(t); })() : null;
    const rn = r ? (() => { const t = tokenize(r); return t && parseTokens(t); })() : null;
    if (l && !ln) return null;
    if (r && !rn) return null;
    if (ln && !rn) {
      if (hasX(ln)) return null;
      return { expression: line.trim(), value: evaluate(ln), kind: "value" };
    }
    if (!ln && rn) {
      if (hasX(rn)) return null;
      return { expression: line.trim(), value: evaluate(rn), kind: "value" };
    }
    if (ln && rn) {
      const xl = countX(ln);
      const xr = countX(rn);
      if (xl + xr !== 1) {
        // "a = b" with no box: nothing to answer; "X = expr" handled above via count
        return null;
      }
      const value = xl ? solve(ln, evaluate(rn)) : solve(rn, evaluate(ln));
      return { expression: line.trim(), value, kind: "missing" };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Find and compute the arithmetic expression in a question's transcribed text. Handles one-line
 * expressions and column layouts ("2 7 4 3" over "× 2 6").
 */
export function computeQuestion(text: string): ExprResult | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i + 1 < lines.length; i++) {
    const top = lines[i].match(/^(\d(?: ?\d)*)$/);
    const bot = lines[i + 1].match(/^([×x+\-−÷])\s*(\d(?: ?\d)*)$/);
    if (top && bot) {
      const expr = `${top[1].replace(/ /g, "")} ${bot[1]} ${bot[2].replace(/ /g, "")} =`;
      const r = computeLine(expr);
      if (r) return { ...r, expression: expr };
    }
  }
  for (const l of lines) {
    if (!/[+\-−×x÷%=]|\bof\b/i.test(l)) continue;
    const r = computeLine(l);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------- answers
/** Number tokens as they appear in mark schemes: mixed numbers, fractions, 1,000-style integers, decimals, vulgar fractions. */
export const NUM_TOKEN =
  /-?\d+\s+\d+\s*\/\s*\d+(?![\d.]|,\d)|-?\d+\s*\/\s*\d+(?![\d.]|,\d)|-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d])|-?\d*\.\d+|-?\d+(?:\s?[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;

export interface ParsedAnswer {
  text: string;
  value: Q;
  form: "integer" | "decimal" | "fraction" | "mixed";
  remainder?: { q: bigint; r: bigint };
}

export function parseAnswerValue(raw: string): ParsedAnswer | null {
  const text = raw.trim();
  const rem = text.match(/^(\d[\d,]*)\s*(?:r|rem|remainder)\s*(\d+)$/i);
  if (rem) {
    const q = BigInt(rem[1].replace(/,/g, ""));
    return { text, value: Q.int(q), form: "integer", remainder: { q, r: BigInt(rem[2]) } };
  }
  const n = normaliseMath(text).replace(/^\s+/, "");
  let m: RegExpMatchArray | null;
  try {
    if ((m = n.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
      const w = BigInt(m[1]);
      const f = new Q(BigInt(m[2]), BigInt(m[3]));
      return { text, value: w < 0n ? Q.int(w).sub(f) : Q.int(w).add(f), form: "mixed" };
    }
    if ((m = n.match(/^(-?\d+)\s*\/\s*(\d+)$/))) return { text, value: new Q(BigInt(m[1]), BigInt(m[2])), form: "fraction" };
    if ((m = n.match(/^-?\d+$/))) return { text, value: Q.int(BigInt(m[0])), form: "integer" };
    if ((m = n.match(/^-?\d*\.\d+$/))) return { text, value: Q.dec(m[0]), form: "decimal" };
  } catch {
    return null;
  }
  return null;
}

export interface RequirementParse {
  /** first number in the requirement: the mark scheme's answer */
  primary: ParsedAnswer | null;
  /** every other value the mark scheme explicitly lists as acceptable (requirement "or" alternatives, "Accept ... e.g." lists) */
  alternatives: ParsedAnswer[];
  equivalentFractions: boolean;
  exactDecimal: boolean;
  /** words left in the requirement after removing numbers and boilerplate: non-empty = needs a human */
  leftover: string;
}

const BOILERPLATE =
  /\b(answer|answers|award|awards|one|two|three|marks?|m|for|the|correct|of|or|and|accept|e\.?g\.?|only|both|required|in|any|order)\b/gi;

/** Split "Accept ... Do not accept ..." guidance, keeping only the accepting part. */
export function acceptingPart(guidance: string): string {
  const cut = guidance.search(/\bdo not (accept|award)\b|\bdo not give\b/i);
  const g = cut >= 0 ? guidance.slice(0, cut) : guidance;
  const out: string[] = [];
  const re = /\baccept\b([^]*?)(?=\bif the answer is\b|\baward\b|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(g))) out.push(m[1]);
  return out.join(" ");
}

export function parseRequirement(requirement: string, guidance: string): RequirementParse {
  const req = requirement
    .replace(/\s+/g, " ")
    .replace(/\baward\s+(?:\d+|one|two|three)\s+marks?\s+for:?/gi, " ")
    .replace(/\b\d\s?m\b/g, " ")
    .trim();
  const tokens = [...req.matchAll(NUM_TOKEN)].map((m) => m[0].trim()).filter(Boolean);
  const answers = tokens.map(parseAnswerValue).filter((a): a is ParsedAnswer => !!a);
  const primary = answers[0] ?? null;
  const alternatives: ParsedAnswer[] = [];
  const seen = new Set<string>(primary ? [primary.text] : []);
  const push = (a: ParsedAnswer | null) => {
    if (a && !seen.has(a.text)) {
      seen.add(a.text);
      alternatives.push(a);
    }
  };
  // "0.25 OR 1/4" style alternatives in the requirement column
  for (const a of answers.slice(1)) push(a);
  const acc = acceptingPart(guidance);
  // numbers in "Accept ... e.g. 0.75" lists; ignore ONE/TWO style mark words (not digits anyway)
  for (const m of acc.matchAll(NUM_TOKEN)) push(parseAnswerValue(m[0]));
  const g = `${req} ${guidance}`.toLowerCase();
  const equivalentFractions = /accept (any )?equivalent fractions?/.test(g) || /equivalent fractions? (are|is) acceptable/.test(g);
  const exactDecimal = /(exact )?decimal equivalent/.test(g) && !/do not accept (the )?(exact )?decimal/.test(g);
  const leftover = req
    .replace(NUM_TOKEN, " ")
    .replace(/award\s+\w+\s+marks?\s+for(\s+the)?\s+correct\s+answer(\s+of)?/gi, " ")
    .replace(BOILERPLATE, " ")
    .replace(/[:;,.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { primary, alternatives, equivalentFractions, exactDecimal, leftover };
}

/** Is the answer value equal to the computed value? Handles remainder answers for integer division. */
export function answerAgrees(answer: ParsedAnswer, computed: ExprResult, expr?: string): boolean {
  if (answer.remainder) {
    const t = normaliseMath(expr ?? computed.expression).match(/(\d+)\s*÷\s*(\d+)/);
    if (!t) return false;
    const a = BigInt(t[1]);
    const b = BigInt(t[2]);
    return a / b === answer.remainder.q && a % b === answer.remainder.r;
  }
  return answer.value.eq(computed.value);
}
