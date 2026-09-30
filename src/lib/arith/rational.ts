/** Exact rational arithmetic for generating and checking arithmetic answers (no float drift). */
export class Q {
  readonly n: number;
  readonly d: number;
  constructor(n: number, d = 1) {
    if (d === 0) throw new Error("division by zero");
    if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error("Q needs integers");
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    const s = d < 0 ? -1 : 1;
    this.n = (s * n) / g;
    this.d = (s * d) / g;
  }
  static of(x: number | Q): Q {
    if (x instanceof Q) return x;
    if (Number.isInteger(x)) return new Q(x, 1);
    const s = x.toString();
    const dp = s.includes(".") ? s.split(".")[1].length : 0;
    const scale = 10 ** dp;
    return new Q(Math.round(x * scale), scale);
  }
  add(o: Q | number) { const b = Q.of(o); return new Q(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(o: Q | number) { const b = Q.of(o); return new Q(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(o: Q | number) { const b = Q.of(o); return new Q(this.n * b.n, this.d * b.d); }
  div(o: Q | number) { const b = Q.of(o); return new Q(this.n * b.d, this.d * b.n); }
  eq(o: Q | number) { const b = Q.of(o); return this.n === b.n && this.d === b.d; }
  isInt() { return this.d === 1; }
  valueOf() { return this.n / this.d; }
  /** True when the value has a terminating decimal (denominator only has factors 2 and 5). */
  isTerminating() {
    let d = this.d;
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }
  toDecimalString(): string {
    if (!this.isTerminating()) throw new Error("non-terminating");
    let dp = 0;
    let d = this.d;
    while (d !== 1) { if (d % 2 === 0) d /= 2; else d /= 5; dp++; }
    const scaled = Math.round((this.n * 10 ** dp) / this.d);
    const neg = scaled < 0;
    const abs = Math.abs(scaled).toString().padStart(dp + 1, "0");
    const out = dp ? `${abs.slice(0, -dp)}.${abs.slice(-dp)}`.replace(/\.?0+$/, "") : abs;
    return (neg ? "-" : "") + out;
  }
  toFractionString() { return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`; }
  toMixedString() {
    if (this.d === 1 || Math.abs(this.n) < this.d) return this.toFractionString();
    const whole = Math.trunc(this.n / this.d);
    const rem = Math.abs(this.n % this.d);
    return `${whole} ${rem}/${this.d}`;
  }
}

export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Thousands separators the way STA papers print numbers: 4,873 */
export function fmt(n: number): string {
  const [i, f] = String(n).split(".");
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${withCommas}.${f}` : withCommas;
}
