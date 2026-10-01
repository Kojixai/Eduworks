// Access codes and order numbers. Shared by the browser, the server and scripts.

/** Letters and digits that cannot be confused when printed: no 0/O, 1/I/L, 5/S, 2/Z, 8/B. */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Group a code for printing: INK-ABCD-EFGH */
export function formatCode(code: string): string {
  const n = normaliseCode(code);
  const body = n.startsWith("INK") ? n.slice(3) : n;
  const grouped = body.match(/.{1,4}/g)?.join("-") ?? body;
  return n.startsWith("INK") ? `INK-${grouped}` : grouped;
}

export function generateCode(randomBytes: (n: number) => Uint8Array, length = 8): string {
  const out: string[] = [];
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      // rejection sampling keeps every character equally likely
      if (b < 250 && out.length < length) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
    }
  }
  return "INK" + out.join("");
}

/** Order numbers look like 203-1234567-1234567 (3-7-7 digits). */
export const ORDER_RE = /^\d{3}-\d{7}-\d{7}$/;

export function normaliseOrderNumber(input: string): string {
  const digits = input.replace(/[\s‐-―−]/g, (c) => (/\s/.test(c) ? "" : "-")).trim();
  const onlyDigits = digits.replace(/-/g, "");
  if (/^\d{17}$/.test(onlyDigits)) return `${onlyDigits.slice(0, 3)}-${onlyDigits.slice(3, 10)}-${onlyDigits.slice(10)}`;
  return digits;
}

export function isValidOrderNumber(input: string): boolean {
  return ORDER_RE.test(normaliseOrderNumber(input));
}

/** Demo mode codes: DEMO- plus the book id. Shown on screen in demo mode only. */
export function demoCodeFor(bookId: string): string {
  return "DEMO-" + bookId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
}
